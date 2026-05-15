const router = require('express').Router();
const { getRequests, createRequest, updateRequest, deleteRequest } = require('../controllers/requestController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/', protect, getRequests);
router.post('/', protect, createRequest);
router.put('/:id', protect, adminOnly, updateRequest);
router.delete('/:id', protect, adminOnly, deleteRequest);

module.exports = router;
