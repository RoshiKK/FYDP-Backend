// routes/admin.js
const express = require('express');
const {
  getAdminDashboard,
  getAdminIncidents,
  bulkIncidentActions,
  getSystemAnalytics
} = require('../controllers/adminController');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

// All routes protected and only for admin/superadmin
router.use(protect);
router.use(authorize('admin', 'superadmin'));
router.get('/driver-incidents/:driverId', protect, authorize('superadmin'), async (req, res) => {
  try {
    const { driverId } = req.params;
    
    // Find the driver
    const driver = await User.findById(driverId);
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    // Get incidents assigned to this driver
    const incidents = await Incident.find({
      'assignedTo.driver': driverId
    })
    .populate('reportedBy', 'name email phone')
    .populate('assignedTo.driver', 'name phone department')
    .sort('-createdAt');
    
    res.status(200).json({
      success: true,
      driver: {
        id: driver._id,
        name: driver.name,
        email: driver.email,
        department: driver.department
      },
      count: incidents.length,
      data: incidents
    });
  } catch (error) {
    console.error('Error getting driver incidents for super admin:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});
router.get('/dashboard', getAdminDashboard);
router.get('/incidents', getAdminIncidents);
router.post('/incidents/bulk-actions', bulkIncidentActions);
router.get('/analytics', getSystemAnalytics);

module.exports = router;