const Entry = require('../models/Entry');
const { dayBounds } = require('../utils/entryDay');
const { createEmptyEntryForDate, collapseDuplicateEntriesForDay } = require('../services/settlementEntrySync');

/** One calendar day = one entry. Same-day check uses local day bounds. */
const findEntryOnSameDay = async (dateInput, excludeId) => {
  const b = dayBounds(dateInput);
  if (!b) return null;
  const q = { date: { $gte: b.start, $lte: b.end } };
  if (excludeId) q._id = { $ne: excludeId };
  return Entry.findOne(q);
};

const assertUniqueFoodWastageItems = (body) => {
  const check = (rows, label) => {
    const seen = new Map();
    for (const r of rows || []) {
      const key = (r.item || '').trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) {
        return `Duplicate ${label} item name: "${(r.item || '').trim()}"`;
      }
      seen.set(key, true);
    }
    return null;
  };
  const fw = body.expenses?.foodWastage || {};
  return check(fw.cooked || [], 'cooked food wastage')
    || check(fw.raw || [], 'raw food wastage');
};

const normalizeFoodWastage = (body) => {
  if (!body.expenses?.foodWastage) return;
  const norm = (rows) => (rows || []).map((r) => ({
    ...r,
    item: (r.item || '').trim(),
    qty: Number(r.qty) || 0,
    amount: Number(r.amount) || 0,
  }));
  body.expenses.foodWastage = {
    cooked: norm(body.expenses.foodWastage.cooked),
    raw: norm(body.expenses.foodWastage.raw),
  };
};

/** Keep `revenue.total` in sync with channel fields (client charts / exports use both). */
const normalizeRevenueTotal = (body) => {
  if (!body.revenue) body.revenue = {};
  const r = body.revenue;
  const n = (x) => Number(x) || 0;
  ['cash', 'federal', 'vibgyor', 'asif'].forEach((k) => {
    if (r[k] !== undefined && r[k] !== null) r[k] = n(r[k]);
  });
  r.total = n(r.cash) + n(r.federal) + n(r.vibgyor) + n(r.asif);
};

const buildDateFilter = (filter, customStart, customEnd) => {
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
    case 'month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { $gte: s };
    }
    case 'lastmonth': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { $gte: s, $lte: e };
    }
    case 'year': {
      const s = new Date(now.getFullYear(), 0, 1);
      return { $gte: s };
    }
    case 'custom': {
      const q = {};
      if (customStart) q.$gte = new Date(customStart);
      if (customEnd) { const e = new Date(customEnd); e.setHours(23,59,59,999); q.$lte = e; }
      return q;
    }
    default:
      return {};
  }
};

exports.getEntries = async (req, res) => {
  try {
    const { filter = 'all', start, end, page = 1, limit = 20 } = req.query;
    const query = {};
    const dateFilter = buildDateFilter(filter, start, end);
    if (Object.keys(dateFilter).length) query.date = dateFilter;

    const total = await Entry.countDocuments(query);
    const entries = await Entry.find(query)
      .populate('createdBy', 'name')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json({ entries, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getEntry = async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id).populate('createdBy', 'name');
    if (!entry) return res.status(404).json({ message: 'Entry not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createEntry = async (req, res) => {
  try {
    normalizeFoodWastage(req.body);
    normalizeRevenueTotal(req.body);
    const dupErr = assertUniqueFoodWastageItems(req.body);
    if (dupErr) return res.status(400).json({ message: dupErr });
    await collapseDuplicateEntriesForDay(req.body.date);
    const existing = await findEntryOnSameDay(req.body.date, null);
    if (existing) {
      return res.status(400).json({ message: 'Only one ROI entry is allowed per calendar day. Edit the existing entry or pick another date.' });
    }
    const entry = await Entry.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateEntry = async (req, res) => {
  try {
    normalizeFoodWastage(req.body);
    normalizeRevenueTotal(req.body);
    const dupErr = assertUniqueFoodWastageItems(req.body);
    if (dupErr) return res.status(400).json({ message: dupErr });
    await collapseDuplicateEntriesForDay(req.body.date);
    const existing = await findEntryOnSameDay(req.body.date, req.params.id);
    if (existing) {
      return res.status(400).json({ message: 'Another entry already exists for this date. Only one entry per day is allowed.' });
    }
    const entry = await Entry.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!entry) return res.status(404).json({ message: 'Entry not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteEntry = async (req, res) => {
  try {
    await Entry.findByIdAndDelete(req.params.id);
    res.json({ message: 'Entry deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Create a blank ROI entry for today if none exists (one entry per day rule). */
exports.ensureTodayEntry = async (req, res) => {
  try {
    const now = new Date();
    await collapseDuplicateEntriesForDay(now);
    const b = dayBounds(now);
    const existing = await Entry.findOne({ date: { $gte: b.start, $lte: b.end } });
    if (existing) return res.json({ entry: existing, created: false });
    let entry;
    try {
      entry = await Entry.create({ ...createEmptyEntryForDate(now, req.user._id) });
    } catch (e) {
      if (e.code === 11000) {
        entry = await Entry.findOne({ date: { $gte: b.start, $lte: b.end } });
        if (entry) return res.json({ entry, created: false });
      }
      throw e;
    }
    res.status(201).json({ entry, created: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
