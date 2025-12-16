const express = require('express');
const { protect } = require('../middleware/auth');
const {
  getNotifications,
  markAsRead,
  getUnreadCount
} = require('../controllers/notifications');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getNotifications);

router.get('/unread/count', getUnreadCount);
router.put('/:id/read', markAsRead);

module.exports = router;