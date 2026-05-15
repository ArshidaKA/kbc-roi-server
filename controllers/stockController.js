const Stock = require('../models/Stock');

exports.getStock = async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const query = type ? { type } : {};
    const total = await Stock.countDocuments(query);
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const pageNum = Math.max(Number(page) || 1, 1);
    const stocks = await Stock.find(query).sort({ date: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).populate('createdBy', 'name');
    const pages = Math.max(1, Math.ceil(total / limitNum));
    res.json({ stocks, total, pages, page: pageNum, limit: limitNum });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Current calendar month totals (all opening / closing rows in month). */
exports.getMonthTotals = async (req, res) => {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [openAgg, closeAgg] = await Promise.all([
      Stock.aggregate([{ $match: { type: 'opening', date: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$totalValue' } } }]),
      Stock.aggregate([{ $match: { type: 'closing', date: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$totalValue' } } }]),
    ]);
    res.json({
      monthOpening: openAgg[0]?.total ?? 0,
      monthClosing: closeAgg[0]?.total ?? 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getTodayStock = async (req, res) => {
  try {
    const s = new Date(); s.setHours(0,0,0,0);
    const e = new Date(); e.setHours(23,59,59,999);
    const opening = await Stock.findOne({ type: 'opening', date: { $gte: s, $lte: e } });
    const closing = await Stock.findOne({ type: 'closing', date: { $gte: s, $lte: e } });
    res.json({ opening, closing });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.saveStock = async (req, res) => {
  try {
    const { date, type, items, notes } = req.body;
    const d = new Date(date); d.setHours(0,0,0,0);
    const de = new Date(date); de.setHours(23,59,59,999);
    let stock = await Stock.findOne({ type, date: { $gte: d, $lte: de } });
    if (stock) {
      stock.items = items;
      stock.notes = notes;
      stock.totalValue = items.reduce((s, i) => s + (i.value || 0), 0);
      await stock.save();
    } else {
      stock = await Stock.create({ date, type, items, notes, createdBy: req.user._id });
    }
    res.json(stock);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteStock = async (req, res) => {
  try {
    await Stock.findByIdAndDelete(req.params.id);
    res.json({ message: 'Stock entry deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
