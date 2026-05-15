const router = require('express').Router();
const { getStock, getTodayStock, getMonthTotals, saveStock, deleteStock } = require('../controllers/stockController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getStock);
router.get('/month-totals', protect, getMonthTotals);
router.get('/today', protect, getTodayStock);
router.post('/', protect, saveStock);
router.delete('/:id', protect, deleteStock);

module.exports = router;
