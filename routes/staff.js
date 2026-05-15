const router = require('express').Router();
const {
  getStaff, createStaff, updateStaff, deleteStaff,
  addSettlement, updateSettlement, deleteSettlement,
  resetSettlements, getSalarySummary, getSettlementsForDay,
} = require('../controllers/staffController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/',               protect, getStaff);
router.get('/salary-summary', protect, getSalarySummary);
router.get('/settlements-for-day', protect, getSettlementsForDay);
router.post('/',              protect, adminOnly, createStaff);
router.put('/:id',            protect, adminOnly, updateStaff);
router.delete('/:id',         protect, adminOnly, deleteStaff);

router.post('/:id/settle',                          protect, adminOnly, addSettlement);
router.put('/:id/settlements/:settlementId',        protect, adminOnly, updateSettlement);
router.delete('/:id/settlements/:settlementId',     protect, adminOnly, deleteSettlement);
router.post('/:id/reset-settlements',               protect, adminOnly, resetSettlements);

module.exports = router;
