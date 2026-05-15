const router = require('express').Router();
const {
  getEntries, getEntry, createEntry, updateEntry, deleteEntry, ensureTodayEntry,
} = require('../controllers/entryController');
const { protect, adminOnly } = require('../middleware/auth');

router.post('/ensure-today', protect, ensureTodayEntry);
router.get('/', protect, getEntries);
router.get('/:id', protect, getEntry);
router.post('/', protect, createEntry);
router.put('/:id', protect, updateEntry);
router.delete('/:id', protect, adminOnly, deleteEntry);

module.exports = router;
