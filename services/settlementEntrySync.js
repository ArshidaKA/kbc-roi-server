const mongoose = require('mongoose');
const Entry = require('../models/Entry');
const { dayBounds } = require('../utils/entryDay');

const initExpItem = () => ({ amount: 0, fromAccount: '', isCredit: false, creditSettled: 0 });

/** Plain object suitable for Entry.create — blank ROI row for one calendar day. */
exports.createEmptyEntryForDate = (dateInput, createdByUserId) => {
  const d = new Date(dateInput);
  return {
    date: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0),
    ventureName: '',
    revenue: { cash: 0, federal: 0, vibgyor: 0, asif: 0, total: 0 },
    purchaseCost: [],
    expenses: {
      royaltyFees: [],
      operations: {
        foodRefreshment: initExpItem(),
        rent: initExpItem(),
        electricity: initExpItem(),
        travelFuel: initExpItem(),
        mobileInternet: initExpItem(),
        maintenance: initExpItem(),
        incentive: initExpItem(),
      },
      gas: { staff: initExpItem(), store: initExpItem() },
      marketing: [],
      foodWastage: { cooked: [], raw: [] },
      other: [],
      salary: [],
    },
    createdBy: createdByUserId,
  };
};

/**
 * If multiple ROI rows exist for the same calendar day (race / legacy), keep the oldest and delete the rest.
 */
exports.collapseDuplicateEntriesForDay = async (dateInput) => {
  const b = dayBounds(dateInput);
  if (!b) return null;
  const list = await Entry.find({ date: { $gte: b.start, $lte: b.end } }).sort({ createdAt: 1 });
  if (list.length <= 1) return list[0] || null;
  const keeper = list[0];
  const restIds = list.slice(1).map((e) => e._id);
  await Entry.deleteMany({ _id: { $in: restIds } });
  return keeper;
};

/** Remove salary line(s) linked to a staff settlement from every entry (e.g. before re-sync or delete). */
exports.pullSalaryLinesBySettlementId = async (settlementId) => {
  const id = mongoose.Types.ObjectId.isValid(settlementId)
    ? new mongoose.Types.ObjectId(String(settlementId))
    : settlementId;
  await Entry.updateMany({}, { $pull: { 'expenses.salary': { sourceSettlementId: id } } });
};

