const mongoose = require('mongoose');

const expenseItemSchema = new mongoose.Schema({
  amount: { type: Number, default: 0 },
  fromAccount: { type: String, enum: ['cash', 'federal', 'vibgyor', 'asif', ''], default: '' },
  isCredit: { type: Boolean, default: false },
  creditSettled: { type: Number, default: 0 },
}, { _id: false });

const namedExpenseSchema = new mongoose.Schema({
  label: String,
  amount: { type: Number, default: 0 },
  fromAccount: { type: String, enum: ['cash', 'federal', 'vibgyor', 'asif', ''], default: '' },
  isCredit: { type: Boolean, default: false },
  creditSettled: { type: Number, default: 0 },
});

const purchaseItemSchema = new mongoose.Schema({
  item: { type: String, default: '' },
  amount: { type: Number, default: 0 },
  fromAccount: { type: String, enum: ['cash', 'federal', 'vibgyor', 'asif', ''], default: '' },
  isCredit: { type: Boolean, default: false },
  creditSettled: { type: Number, default: 0 },
  vendorName: { type: String, default: '' },
});

const foodWastageItemSchema = new mongoose.Schema({
  item: { type: String, default: '' },
  qty: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
});

const salaryItemSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  staffName: String,
  amount: { type: Number, default: 0 },
  fromAccount: { type: String, enum: ['cash', 'federal', 'vibgyor', 'asif', ''], default: '' },
  isCredit: { type: Boolean, default: false },
  creditSettled: { type: Number, default: 0 },
  note: { type: String, default: '' },
  /** When set, this line was created from Staff → Settle and is kept in sync with that payment */
  sourceSettlementId: { type: mongoose.Schema.Types.ObjectId, required: false },
});

const entrySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  ventureName: { type: String, default: '' },
  revenue: {
    cash: { type: Number, default: 0 },
    federal: { type: Number, default: 0 },
    vibgyor: { type: Number, default: 0 },
    asif: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  purchaseCost: [purchaseItemSchema],
  expenses: {
    royaltyFees: [namedExpenseSchema],
    operations: {
      foodRefreshment: { type: expenseItemSchema, default: {} },
      rent: { type: expenseItemSchema, default: {} },
      electricity: { type: expenseItemSchema, default: {} },
      travelFuel: { type: expenseItemSchema, default: {} },
      mobileInternet: { type: expenseItemSchema, default: {} },
      maintenance: { type: expenseItemSchema, default: {} },
      incentive: { type: expenseItemSchema, default: {} },
    },
    gas: {
      staff: { type: expenseItemSchema, default: {} },
      store: { type: expenseItemSchema, default: {} },
    },
    marketing: [namedExpenseSchema],
    foodWastage: {
      cooked: [foodWastageItemSchema],
      raw: [foodWastageItemSchema],
    },
    other: [namedExpenseSchema],
    salary: [salaryItemSchema],
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

entrySchema.pre('save', function (next) {
  this.revenue.total =
    (this.revenue.cash || 0) +
    (this.revenue.federal || 0) +
    (this.revenue.vibgyor || 0) +
    (this.revenue.asif || 0);
  next();
});

module.exports = mongoose.model('Entry', entrySchema);
