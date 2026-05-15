const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  amount: { type: Number, required: true },
  fromAccount: { type: String, enum: ['cash', 'federal', 'vibgyor', 'asif', ''], default: '' },
  note: { type: String, default: '' },
});

const salaryCreditSchema = new mongoose.Schema({
  month: { type: String, required: true },        // 'YYYY-MM'
  amount: { type: Number, required: true },
  date:   { type: Date,   required: true },
}, { _id: false });

const staffSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  role:     { type: String, required: true, trim: true },
  salary:   { type: Number, required: true, default: 0 },
  joinedAt: { type: Date,   default: Date.now },
  isActive: { type: Boolean, default: true },
  settlements:    [settlementSchema],
  salaryCredits:  [salaryCreditSchema],
}, { timestamps: true });

staffSchema.virtual('totalBilled').get(function () {
  // If no credits exist yet (legacy data), fall back to a single salary
  if (!this.salaryCredits || this.salaryCredits.length === 0) return this.salary;
  return this.salaryCredits.reduce((sum, c) => sum + (c.amount || 0), 0);
});

staffSchema.virtual('totalSettled').get(function () {
  return (this.settlements || []).reduce((sum, s) => sum + (s.amount || 0), 0);
});

staffSchema.virtual('outstanding').get(function () {
  return this.totalBilled - this.totalSettled;
});

staffSchema.virtual('monthsBilled').get(function () {
  return this.salaryCredits?.length || 0;
});

staffSchema.set('toJSON',   { virtuals: true });
staffSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Staff', staffSchema);
