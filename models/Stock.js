const mongoose = require('mongoose');

const stockItemSchema = new mongoose.Schema({
  item: { type: String, default: '' },
  unit: { type: String, default: '' },
  value: { type: Number, default: 0 },
}, { _id: false });

const stockSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  type: { type: String, enum: ['opening', 'closing'], required: true },
  items: [stockItemSchema],
  totalValue: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

stockSchema.pre('save', function (next) {
  this.totalValue = this.items.reduce((sum, i) => sum + (i.value || 0), 0);
  next();
});

module.exports = mongoose.model('Stock', stockSchema);
