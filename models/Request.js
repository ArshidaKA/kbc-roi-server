const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  type: { type: String, required: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  amount: { type: Number, default: 0 },
  note: { type: String, default: '' },
  resolvedNote: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Request', requestSchema);
