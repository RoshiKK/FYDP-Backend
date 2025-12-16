const express = require('express');
const { protect } = require('../middleware/auth');
const {
  getDashboardStats,
  getAdminDashboard,
  getDepartmentDashboard,
  getDriverDashboard,
  getHospitalDashboard
} = require('../controllers/dashboard');

const router = express.Router();

router.use(protect);

router.get('/stats', getDashboardStats);
router.get('/admin', getAdminDashboard);
router.get('/department', getDepartmentDashboard);
router.get('/driver', getDriverDashboard);
router.get('/hospital', getHospitalDashboard);


module.exports = router;