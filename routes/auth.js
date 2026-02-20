/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and user management
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current logged in user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authorized
 */

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
const express = require('express');
const {
  register,
  login,
  mobileLogin,
  getMe,
  updateDetails,
  updatePassword,
  logout,
  getAccessibleDashboards,
  verifyToken,
  mobileTest,
  impersonateUser,
  returnToAdmin
} = require('../controllers/auth');

const router = express.Router();

const { protect } = require('../middleware/auth');

console.log('🔄 Auth routes initialized');

// ========== PUBLIC ROUTES ==========

router.post('/register', register);
router.post('/login', login);
router.post('/mobile/login', mobileLogin);
router.get('/mobile/test', mobileTest);
router.post('/impersonate/:userId', protect, impersonateUser);
router.post('/return-to-admin', protect, returnToAdmin);

// Make these routes public temporarily
router.get('/me', getMe);
router.put('/updatedetails', updateDetails); 
router.put('/updatepassword', updatePassword);
router.post('/logout', logout);
router.get('/dashboards', getAccessibleDashboards);
router.get('/verify', verifyToken);

module.exports = router;