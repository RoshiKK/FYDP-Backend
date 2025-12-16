const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  restrictUser,
  getUserStats,
  getDriversByDepartment,
  getDriversForDepartment,
} = require('../controllers/users');


const router = express.Router();

router.get('/department/drivers', protect, getDriversForDepartment);

router.use(protect);
router.use(authorize('admin', 'superadmin'));

router.route('/')
  .get(getUsers)
  .post(createUser);

router.route('/stats')
  .get(getUserStats);

router.route('/:id')
  .get(getUser)
  .put(updateUser)
  .delete(deleteUser);

router.put('/:id/restrict', restrictUser);
router.get('/drivers/:department', getDriversByDepartment);

module.exports = router;