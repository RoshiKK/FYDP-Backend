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