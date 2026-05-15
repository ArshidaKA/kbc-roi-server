const Staff = require('../models/Staff');
const { dayBounds } = require('../utils/entryDay');
const { pullSalaryLinesBySettlementId } = require('../services/settlementEntrySync');

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * Auto-generate monthly salary credits from joinedAt → current month.
 * Idempotent: only adds missing months.
 */
const ensureMonthlyBills = async (staff) => {
  const now = new Date();
  const start = new Date(staff.joinedAt || staff.createdAt || now);
  const billedMonths = new Set((staff.salaryCredits || []).map(c => c.month));

  let cursor   = new Date(start.getFullYear(), start.getMonth(), 1);
  const target = new Date(now.getFullYear(), now.getMonth(), 1);

  let modified = false;
  while (cursor <= target) {
    const key = monthKey(cursor);
    if (!billedMonths.has(key)) {
      staff.salaryCredits.push({
        month: key,
        amount: staff.salary,
        date: new Date(cursor.getFullYear(), cursor.getMonth(), 1),
      });
      modified = true;
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  if (modified) await staff.save();
  return staff;
};

exports.ensureMonthlyBills = ensureMonthlyBills;

/** Flat list of salary settlements on a given calendar day (for ROI entry form). */
exports.getSettlementsForDay = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).json({ message: 'Query ?date=YYYY-MM-DD is required' });
    }
    const b = dayBounds(date);
    if (!b) return res.status(400).json({ message: 'Invalid date' });
    const staff = await Staff.find({ isActive: true }).sort({ name: 1 });
    const rows = [];
    staff.forEach((s) => {
      (s.settlements || []).forEach((st) => {
        const d = new Date(st.date);
        if (d >= b.start && d <= b.end) {
          rows.push({
            staffId: s._id,
            staffName: s.name,
            settlementId: st._id,
            date: st.date,
            fromAccount: st.fromAccount || '',
            amount: st.amount,
            note: st.note || '',
          });
        }
      });
    });
    rows.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getStaff = async (req, res) => {
  try {
    const staff = await Staff.find({ isActive: true }).sort({ name: 1 });
    await Promise.all(staff.map(ensureMonthlyBills));
    res.json(staff);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createStaff = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.joinedAt) data.joinedAt = new Date(data.joinedAt);
    const s = await Staff.create(data);
    await ensureMonthlyBills(s);
    res.status(201).json(s);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateStaff = async (req, res) => {
  try {
    const s = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!s) return res.status(404).json({ message: 'Staff not found' });
    res.json(s);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteStaff = async (req, res) => {
  try {
    await Staff.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Staff deactivated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addSettlement = async (req, res) => {
  try {
    const { amount, fromAccount, note, date } = req.body;
    const s = await Staff.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Staff not found' });
    s.settlements.push({
      amount: Number(amount),
      fromAccount: fromAccount || '',
      note: note || '',
      date: date ? new Date(date) : new Date(),
    });
    await s.save();
    await ensureMonthlyBills(s);
    res.json(s);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSettlement = async (req, res) => {
  try {
    const { amount, fromAccount, note, date } = req.body;
    const s = await Staff.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Staff not found' });
    const settlement = s.settlements.id(req.params.settlementId);
    if (!settlement) return res.status(404).json({ message: 'Settlement not found' });
    if (amount !== undefined)      settlement.amount      = Number(amount);
    if (fromAccount !== undefined) settlement.fromAccount = fromAccount;
    if (note !== undefined)        settlement.note        = note;
    if (date !== undefined)        settlement.date        = new Date(date);
    await s.save();
    res.json(s);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteSettlement = async (req, res) => {
  try {
    const sid = req.params.settlementId;
    const s = await Staff.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Staff not found' });
    try {
      await pullSalaryLinesBySettlementId(sid);
    } catch (syncErr) {
      console.error('pullSalaryLinesBySettlementId', syncErr);
    }
    s.settlements.id(sid)?.deleteOne();
    await s.save();
    res.json(s);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.resetSettlements = async (req, res) => {
  try {
    const s = await Staff.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Staff not found' });
    for (const st of s.settlements || []) {
      try {
        await pullSalaryLinesBySettlementId(st._id);
      } catch (e) { console.error(e); }
    }
    s.settlements = [];
    await s.save();
    res.json(s);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSalarySummary = async (req, res) => {
  try {
    const staff = await Staff.find({ isActive: true });
    await Promise.all(staff.map(ensureMonthlyBills));
    const totalBill     = staff.reduce((s, st) => s + st.totalBilled,  0);
    const totalSettled  = staff.reduce((s, st) => s + st.totalSettled, 0);
    res.json({
      staff,
      totalBill,
      totalSettled,
      outstanding: totalBill - totalSettled,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
