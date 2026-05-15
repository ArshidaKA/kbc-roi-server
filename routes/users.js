const router = require('express').Router();
const { getUsers, updateUser, resetPassword, deleteUser } = require('../controllers/userController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/', protect, adminOnly, getUsers);
router.put('/:id', protect, adminOnly, updateUser);
router.put('/:id/reset-password', protect, adminOnly, resetPassword);
router.delete('/:id', protect, adminOnly, deleteUser);

module.exports = router;
