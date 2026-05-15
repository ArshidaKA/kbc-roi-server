const router = require('express').Router();
const { getSummary } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getSummary);

module.exports = router;
