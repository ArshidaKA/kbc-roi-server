const Request = require('../models/Request');

exports.getRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const requests = await Request.find(query)
      .populate('requestedBy', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createRequest = async (req, res) => {
  try {
    const r = await Request.create({ ...req.body, requestedBy: req.user._id });
    res.status(201).json(r);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateRequest = async (req, res) => {
  try {
    const r = await Request.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('requestedBy', 'name email')
      .populate('assignedTo', 'name email');
    if (!r) return res.status(404).json({ message: 'Request not found' });
    res.json(r);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteRequest = async (req, res) => {
  try {
    await Request.findByIdAndDelete(req.params.id);
    res.json({ message: 'Request deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
