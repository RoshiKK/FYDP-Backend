/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management endpoints
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users (Admin/SuperAdmin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       403:
 *         description: Not authorized
 */

/**
 * @swagger
 * /users/department/drivers:
 *   get:
 *     summary: Get drivers for current department (Department users only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of drivers in department
 *       403:
 *         description: Not authorized
 */

/**
 * @swagger
 * /users/drivers/{department}:
 *   get:
 *     summary: Get drivers by department name
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: department
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Edhi Foundation, Chippa Ambulance]
 *         description: Department name
 *     responses:
 *       200:
 *         description: List of drivers
 *       403:
 *         description: Not authorized
 */
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