const Entry = require('../models/Entry');
const Staff = require('../models/Staff');
const Stock = require('../models/Stock');
const { ensureMonthlyBills } = require('./staffController');

// ── Opening / carry-forward balances ──────────────────────────────────────
const OPENING_BALANCES = {
  cash:    30780,
  federal: 51855.15,
  vibgyor: 73000,
  asif:    7742,
};

const dateFilter = (filter, start, end) => {
  const now = new Date();
  switch (filter) {
    case 'today': {
      const s = new Date(now); s.setHours(0,0,0,0);
      const e = new Date(now); e.setHours(23,59,59,999);
      return { $gte: s, $lte: e };
    }
    case 'week': {
      const s = new Date(now); s.setDate(now.getDate() - 6); s.setHours(0,0,0,0);
      return { $gte: s };
    }
    case 'month':
      return { $gte: new Date(now.getFullYear(), now.getMonth(), 1) };
    case 'year':
      return { $gte: new Date(now.getFullYear(), 0, 1) };
    case 'custom': {
      const q = {};
      if (start) q.$gte = new Date(start);
      if (end) { const e = new Date(end); e.setHours(23,59,59,999); q.$lte = e; }
      return q;
    }
    default: return {};
  }
};

const inDateRange = (df, date) => {
  if (!Object.keys(df).length) return true;
  const d = new Date(date);
  if (df.$gte && d < df.$gte) return false;
  if (df.$lte && d > df.$lte) return false;
  return true;
};

const calcExpenses = (entry) => {
  let purchaseCost = 0, indirect = 0, expCredit = 0, expCreditSettled = 0;

  entry.purchaseCost.forEach(p => {
    purchaseCost += p.amount || 0;
    if (p.isCredit) { expCredit += (p.amount || 0) - (p.creditSettled || 0); expCreditSettled += p.creditSettled || 0; }
  });

  const addOp = (op) => {
    if (!op) return;
    indirect += op.amount || 0;
    if (op.isCredit) { expCredit += (op.amount || 0) - (op.creditSettled || 0); expCreditSettled += op.creditSettled || 0; }
  };

  const ops = entry.expenses?.operations || {};
  Object.values(ops).forEach(addOp);
  [entry.expenses?.gas?.staff, entry.expenses?.gas?.store].forEach(addOp);
  (entry.expenses?.royaltyFees || []).forEach(addOp);
  (entry.expenses?.marketing || []).forEach(addOp);
  (entry.expenses?.other || []).forEach(addOp);

  const fw = entry.expenses?.foodWastage || {};
  [...(fw.cooked || []), ...(fw.raw || [])].forEach(f => { indirect += f.amount || 0; });

  (entry.expenses?.salary || []).forEach(s => {
    indirect += s.amount || 0;
    if (s.isCredit) { expCredit += (s.amount || 0) - (s.creditSettled || 0); expCreditSettled += s.creditSettled || 0; }
  });

  return { purchaseCost, indirect, expCredit, expCreditSettled };
};

exports.getSummary = async (req, res) => {
  try {
    const { filter = 'all', start, end } = req.query;
    const df = dateFilter(filter, start, end);
    const query = Object.keys(df).length ? { date: df } : {};

    const entries = await Entry.find(query);

    let totalRevenue = 0, totalPC = 0, totalIndirect = 0, expCredit = 0, expCreditSettled = 0;

    // Seed accounts with opening balances (only for 'all' filter, so balances are always total)
    const accounts = {
      cash:    OPENING_BALANCES.cash,
      federal: OPENING_BALANCES.federal,
      vibgyor: OPENING_BALANCES.vibgyor,
      asif:    OPENING_BALANCES.asif,
    };

    const revenueByChannel = { cash: 0, federal: 0, vibgyor: 0, asif: 0 };
    const expenseSplit = {};
    const trendMap = {};

    const n = (x) => Number(x) || 0;

    const ACCT_KEYS = ['cash', 'federal', 'vibgyor', 'asif'];
    const emptyAcctBreakdown = () => ({
      revenueIn: 0,
      purchasePaid: 0,
      indirectPaidByLabel: {},
      manualSalaryPaid: 0,
      salarySettlements: [],
    });
    const acctBreak = { cash: emptyAcctBreakdown(), federal: emptyAcctBreakdown(), vibgyor: emptyAcctBreakdown(), asif: emptyAcctBreakdown() };

    entries.forEach(e => {
      const rev = e.revenue || {};
      const chSum = n(rev.cash) + n(rev.federal) + n(rev.vibgyor) + n(rev.asif);
      const dayRev = chSum > 0 ? chSum : n(rev.total);
      totalRevenue += dayRev;
      revenueByChannel.cash    += n(rev.cash);
      revenueByChannel.federal += n(rev.federal);
      revenueByChannel.vibgyor += n(rev.vibgyor);
      revenueByChannel.asif    += n(rev.asif);
      accounts.cash    += n(rev.cash);
      accounts.federal += n(rev.federal);
      accounts.vibgyor += n(rev.vibgyor);
      accounts.asif    += n(rev.asif);
      ACCT_KEYS.forEach((k) => { acctBreak[k].revenueIn += n(rev[k]); });

      const { purchaseCost, indirect, expCredit: ec, expCreditSettled: ecs } = calcExpenses(e);
      totalPC       += purchaseCost;
      totalIndirect += indirect;
      expCredit        += ec;
      expCreditSettled += ecs;

      const deductTrack = (item, spendLabel) => {
        if (!item || !item.fromAccount) return;
        const acct = item.fromAccount;
        if (accounts[acct] === undefined) return;

        let out = 0;
        if (item.isCredit) {
          const cap = n(item.amount);
          out = Math.min(Math.max(n(item.creditSettled), 0), cap || Number.POSITIVE_INFINITY);
          if (!out) return;
        } else {
          out = n(item.amount);
          if (!out) return;
        }

        accounts[acct] -= out;
        if (spendLabel === 'Purchase') acctBreak[acct].purchasePaid += out;
        else if (spendLabel === 'Salary (ROI, manual)') acctBreak[acct].manualSalaryPaid += out;
        else {
          const m = acctBreak[acct].indirectPaidByLabel;
          const key = item.isCredit ? `Credit settled — ${spendLabel}` : spendLabel;
          m[key] = (m[key] || 0) + out;
        }
      };
      e.purchaseCost.forEach((p) => deductTrack(p, 'Purchase'));
      const ops = e.expenses?.operations || {};
      deductTrack(ops.foodRefreshment, 'Food & Refreshment');
      deductTrack(ops.rent, 'Rent');
      deductTrack(ops.electricity, 'Electricity');
      deductTrack(ops.travelFuel, 'Travel & Fuel');
      deductTrack(ops.mobileInternet, 'Mobile & Internet');
      deductTrack(ops.maintenance, 'Maintenance');
      deductTrack(ops.incentive, 'Incentive');
      deductTrack(e.expenses?.gas?.staff, 'Gas — Staff');
      deductTrack(e.expenses?.gas?.store, 'Gas — Store');
      (e.expenses?.royaltyFees || []).forEach((r, i) => deductTrack(r, r.label ? `Royalty: ${r.label}` : `Royalty (${i + 1})`));
      (e.expenses?.marketing || []).forEach((m, i) => deductTrack(m, m.label ? `Marketing: ${m.label}` : `Marketing (${i + 1})`));
      (e.expenses?.other || []).forEach((o, i) => deductTrack(o, o.label ? `Other: ${o.label}` : `Other (${i + 1})`));
      (e.expenses?.salary || []).forEach((s) => {
        if (s && s.sourceSettlementId) return;
        deductTrack(s, 'Salary (ROI, manual)');
      });

      const addSplit = (key, amt) => { if (amt) expenseSplit[key] = (expenseSplit[key] || 0) + amt; };
      e.purchaseCost.forEach(p => addSplit('Purchase Cost', p.amount));
      addSplit('Food & Refreshment', ops.foodRefreshment?.amount);
      addSplit('Rent',               ops.rent?.amount);
      addSplit('Electricity',        ops.electricity?.amount);
      addSplit('Travel & Fuel',      ops.travelFuel?.amount);
      addSplit('Mobile & Internet',  ops.mobileInternet?.amount);
      addSplit('Maintenance',        ops.maintenance?.amount);
      addSplit('Incentive',          ops.incentive?.amount);
      addSplit('Gas Staff',          e.expenses?.gas?.staff?.amount);
      addSplit('Gas Store',          e.expenses?.gas?.store?.amount);
      (e.expenses?.royaltyFees || []).forEach(r => addSplit('Royalty/Mgt', r.amount));
      (e.expenses?.marketing   || []).forEach(m => addSplit('Marketing',   m.amount));
      const fw = e.expenses?.foodWastage || {};
      (fw.cooked || []).forEach(f => addSplit('Food Wastage — cooked', f.amount));
      (fw.raw || []).forEach(f => addSplit('Food Wastage — raw', f.amount));
      (e.expenses?.other  || []).forEach(o => addSplit('Other',  o.amount));
      (e.expenses?.salary || []).forEach(s => addSplit('Salary', s.amount));

      const day = new Date(e.date).toISOString().split('T')[0];
      if (!trendMap[day]) trendMap[day] = { date: day, revenue: 0, expenses: 0, profit: 0 };
      trendMap[day].revenue  += dayRev;
      trendMap[day].expenses += purchaseCost + indirect;
      trendMap[day].profit   += dayRev - purchaseCost - indirect;
    });

    const trend = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

    const allStaff = await Staff.find({ isActive: true });
    await Promise.all(allStaff.map(ensureMonthlyBills));
    const totalSalaryBill     = allStaff.reduce((s, st) => s + st.totalBilled,  0);
    const totalSalarySettled  = allStaff.reduce((s, st) => s + st.totalSettled, 0);
    const salaryOutstanding   = totalSalaryBill - totalSalarySettled;

    allStaff.forEach(st => {
      st.settlements.forEach(settlement => {
        if (!inDateRange(df, settlement.date)) return;
        const acct = settlement.fromAccount;
        const amt = n(settlement.amount);
        if (acct && accounts[acct] !== undefined && amt) {
          accounts[acct] -= amt;
          acctBreak[acct].salarySettlements.push({
            staffName: st.name,
            amount: amt,
            date: settlement.date,
            note: settlement.note || '',
          });
        }
      });
    });

    const accountBreakdown = {};
    ACCT_KEYS.forEach((k) => {
      const x = acctBreak[k];
      const indirectLines = Object.entries(x.indirectPaidByLabel)
        .map(([label, value]) => ({ label, value: n(value) }))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value);
      const settlements = (x.salarySettlements || []).map((s) => ({
        staffName: s.staffName,
        amount: n(s.amount),
        date: s.date,
        note: s.note || '',
      })).sort((a, b) => new Date(b.date) - new Date(a.date));
      accountBreakdown[k] = {
        openingBalance: OPENING_BALANCES[k],   // ← exposed so the modal can show it
        revenueIn: n(x.revenueIn),
        purchasePaid: n(x.purchasePaid),
        indirectLines,
        manualSalaryPaid: n(x.manualSalaryPaid),
        salarySettlements: settlements,
        endingBalance: n(accounts[k]),
      };
    });

    const totalCreditCombined = expCredit + salaryOutstanding;

    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);
    const todayOpening = await Stock.findOne({ type: 'opening', date: { $gte: todayStart, $lte: todayEnd } });
    const todayClosing = await Stock.findOne({ type: 'closing', date: { $gte: todayStart, $lte: todayEnd } });

    const monthStart  = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const [moOpenAgg, moCloseAgg] = await Promise.all([
      Stock.aggregate([{ $match: { type: 'opening', date: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$totalValue' } } }]),
      Stock.aggregate([{ $match: { type: 'closing', date: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$totalValue' } } }]),
    ]);

    const recentEntries = await Entry.find(query).sort({ date: -1 }).limit(5).populate('createdBy', 'name');

    const revenueLines = [
      { label: 'Cash', value: revenueByChannel.cash },
      { label: 'Federal Bank', value: revenueByChannel.federal },
      { label: 'Vibgyor Bank', value: revenueByChannel.vibgyor },
      { label: 'Asif Account', value: revenueByChannel.asif },
    ].filter((x) => x.value > 0);

    const indirectLines = Object.entries(expenseSplit)
      .filter(([k]) => k !== 'Purchase Cost')
      .map(([label, value]) => ({ label, value }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
    const purchaseSplitVal = expenseSplit['Purchase Cost'] || 0;

    res.json({
      totalRevenue,
      totalExpenses: totalPC + totalIndirect,
      totalPC,
      totalIndirect,
      netProfit: totalRevenue - totalPC - totalIndirect,
      margin: totalRevenue ? (((totalRevenue - totalPC - totalIndirect) / totalRevenue) * 100).toFixed(1) : '0',
      cardDetails: {
        revenue: { lines: revenueLines, total: totalRevenue },
        expenses: {
          total: totalPC + totalIndirect,
          purchaseCost: totalPC,
          indirectTotal: totalIndirect,
          purchaseFromSplit: purchaseSplitVal,
          indirectLines,
        },
        netProfit: {
          total: totalRevenue - totalPC - totalIndirect,
          totalRevenue,
          purchaseCost: totalPC,
          indirect: totalIndirect,
        },
        credit: {
          total: totalCreditCombined,
          expenseCredit: expCredit,
          salaryOutstanding,
          expenseCreditSettled: expCreditSettled,
          totalSalarySettled,
        },
        accountBreakdown,
      },
      expCredit,
      expCreditSettled,
      salaryOutstanding,
      totalSalarySettled,
      totalCredit: totalCreditCombined,
      accounts,
      openingBalances: OPENING_BALANCES,   // ← sent to frontend for reference
      expenseSplit: Object.entries(expenseSplit).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, value: v })),
      trend,
      staff: { totalBill: totalSalaryBill, totalSettled: totalSalarySettled, outstanding: salaryOutstanding },
      stock: {
        todayOpening: todayOpening?.totalValue ?? null,
        todayClosing: todayClosing?.totalValue ?? null,
        monthOpening: moOpenAgg[0]?.total ?? 0,
        monthClosing: moCloseAgg[0]?.total ?? 0,
      },
      recentEntries,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};