/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Dashboard data endpoints
 */

/**
 * @swagger
 * /dashboard/stats:
 *   get:
 *     summary: Get dashboard statistics based on user role
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *       401:
 *         description: Not authorized
 */

/**
 * @swagger
 * /dashboard/hospital:
 *   get:
 *     summary: Get hospital dashboard data
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Hospital dashboard data
 *       403:
 *         description: Not a hospital user
 */
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