/**
 * @swagger
 * tags:
 *   name: Incidents
 *   description: Incident management endpoints
 */

/**
 * @swagger
 * /incidents:
 *   get:
 *     summary: Get all incidents (filtered by user role)
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, assigned, in_progress, completed]
 *         description: Filter by incident status
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         description: Filter by priority
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [Accident]
 *         description: Filter by category
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: -createdAt
 *         description: Sort field and order
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in description and location
 *     responses:
 *       200:
 *         description: List of incidents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Incident'
 *       401:
 *         description: Not authorized
 */

/**
 * @swagger
 * /incidents:
 *   post:
 *     summary: Create a new incident
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - location[coordinates]
 *             properties:
 *               description:
 *                 type: string
 *                 default: "Accident reported"
 *               location[coordinates]:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: "[longitude, latitude]"
 *               category:
 *                 type: string
 *                 enum: [Accident]
 *                 default: Accident
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 default: high
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Image files (max 5, 10MB each)
 *     responses:
 *       201:
 *         description: Incident created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Incident'
 *       400:
 *         description: Validation error
 */

/**
 * @swagger
 * /incidents/{id}/approve:
 *   put:
 *     summary: Approve and assign incident to department
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Incident ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - department
 *             properties:
 *               department:
 *                 type: string
 *                 enum: [Edhi Foundation, Chippa Ambulance]
 *                 description: Department to assign
 *               reason:
 *                 type: string
 *                 description: Approval reason
 *     responses:
 *       200:
 *         description: Incident approved
 *       400:
 *         description: Invalid department
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Incident not found
 */

/**
 * @swagger
 * /incidents/{id}/driver-status:
 *   put:
 *     summary: Update driver workflow status
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Incident ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [arrived, transporting, delivered, completed]
 *                 description: New driver status
 *               hospital:
 *                 type: string
 *                 description: Hospital name (required for transporting/delivered)
 *               patientCondition:
 *                 type: string
 *                 description: Patient condition
 *     responses:
 *       200:
 *         description: Status updated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Incident not found
 */

/**
 * @swagger
 * /incidents/{id}/patient-pickup:
 *   put:
 *     summary: Update patient pickup status (Driver only)
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Incident ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pickupStatus
 *             properties:
 *               pickupStatus:
 *                 type: string
 *                 enum: [picked_up, taken_by_someone, expired]
 *                 description: Patient pickup status
 *               notes:
 *                 type: string
 *                 description: Additional notes
 *     responses:
 *       200:
 *         description: Pickup status updated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Incident not found
 */

/**
 * @swagger
 * /incidents/driver/my-incidents:
 *   get:
 *     summary: Get incidents assigned to current driver
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of driver incidents
 *       403:
 *         description: Not a driver
 */

/**
 * @swagger
 * /incidents/hospital/incidents:
 *   get:
 *     summary: Get incidents for current hospital
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Hospital incidents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     incoming:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Incident'
 *                     admitted:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Incident'
 *                     discharged:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Incident'
 */

/**
 * @swagger
 * /incidents/nearby:
 *   get:
 *     summary: Get nearby incidents
 *     tags: [Incidents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: longitude
 *         required: true
 *         schema:
 *           type: number
 *         description: Longitude
 *       - in: query
 *         name: latitude
 *         required: true
 *         schema:
 *           type: number
 *         description: Latitude
 *       - in: query
 *         name: maxDistance
 *         schema:
 *           type: integer
 *           default: 5000
 *         description: Maximum distance in meters
 *     responses:
 *       200:
 *         description: Nearby incidents
 */
const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { apiLimiter, geocodingLimiter } = require('../middleware/rateLimit');

// Import controllers
const {
  getIncidents,
  getIncident,
  createIncident,
  updateIncident,
  deleteIncident,
  approveIncident,
  rejectIncident,
  assignDriver,
  getNearbyIncidents,
  getIncidentStats,
  getDriverIncidents,
  getHospitalIncidents,
  getRawHospitalIncidents,
  debugAllHospitalData,
  updateDriverStatus,
  updateHospitalStatus,
  createRealHospitalData,
  getIncidentsByDriverStatus,
  debugHospitalAssignments,
  getIncidentsByHospitalStatus,
  getDriverWorkflowDashboard,
  getHospitalWorkflowDashboard,
  updateIncidentStatus,
  createHospitalTestData,
  debugHospitalQuery,
  debugHospitalEndpoint,  // This one is missing from exports
  fixHospitalStatus,   
  getHospitalDashboard,
  getDriverIncidentsForSuperAdmin, 
  updatePatientPickupStatus,  // This one is missing from exports
} = require('../controllers/incidents');

const router = express.Router();

// Import models
const Incident = require('../models/Incident');
const User = require('../models/User');

router.use(apiLimiter);

router.route('/')
  .get(protect, getIncidents)
  .post(protect, geocodingLimiter, upload.array('photos', 5), createIncident);

router.route('/stats')
  .get(protect, getIncidentStats);


router.route('/nearby')
  .get(protect, getNearbyIncidents);
router.put('/fix-hospital-status', protect, authorize('hospital', 'admin'), fixHospitalStatus);
router.get('/debug/hospital-endpoint', protect, authorize('hospital'), debugHospitalEndpoint);
// Debug hospital query endpoint  
router.get('/debug/hospital-query', protect, authorize('hospital'), debugHospitalQuery);
router.get('/hospital', protect, authorize('hospital', 'superadmin'), getHospitalDashboard);
router.put('/:id/patient-pickup', protect, authorize('driver'), updatePatientPickupStatus);
// Create proper hospital test data
router.post('/create-hospital-test-data', protect, authorize('hospital', 'admin'), createHospitalTestData);
router.route('/:id')
  .get(protect, getIncident)
  .put(protect, updateIncident)
  .delete(protect, authorize('admin', 'superadmin'), deleteIncident);
router.get('/driver/my-incidents', protect, getDriverIncidents);
router.get('/admin/driver-incidents/:driverId', protect, authorize('superadmin'), getDriverIncidentsForSuperAdmin);
// Driver workflow routes
router.put('/:id/driver-status', protect, authorize('driver'), updateDriverStatus);
router.get('/driver/status/:status', protect, authorize('driver'), getIncidentsByDriverStatus);
router.get('/driver/workflow', protect, authorize('driver'), getDriverWorkflowDashboard);

// Hospital workflow routes  
router.put('/:id/hospital-status', protect, authorize('hospital'), updateHospitalStatus);
router.get('/hospital/status/:status', protect, authorize('hospital'), getIncidentsByHospitalStatus);
router.get('/debug/hospital-raw', protect, getRawHospitalIncidents);
router.get('/debug/all-hospital-data', protect, debugAllHospitalData);
router.get('/hospital/workflow', protect, authorize('hospital', 'superadmin'), getHospitalWorkflowDashboard);
router.get('/hospital/incidents', protect, authorize('hospital', 'superadmin'), getHospitalIncidents);
// Test endpoint for ObjectId debugging
router.get('/debug/objectid-test', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const testId = new mongoose.Types.ObjectId();
    
    res.json({
      success: true,
      objectIdTest: {
        created: testId.toString(),
        isValid: mongoose.Types.ObjectId.isValid(testId),
        sampleUser: await User.findOne().select('_id name').lean()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
router.post('/create-real-hospital-data', protect, createRealHospitalData);
// Hospital incidents route - FIXED
router.get('/hospital/incidents', protect, authorize('hospital'), getHospitalIncidents);

// Debug hospital assignments route - FIXED
router.get('/debug/hospital-assignments', protect, authorize('hospital'), debugHospitalAssignments);

// Debug endpoint for hospital setup
router.get('/debug/hospital-setup', async (req, res) => {
  try {
    const User = require('../models/User');
    const Incident = require('../models/Incident');
    
    console.log('🔍 Debug: Checking hospital setup...');
    
    // Get all hospital users
    const hospitalUsers = await User.find({ role: 'hospital' });
    console.log(`🏥 Found ${hospitalUsers.length} hospital users`);
    
    // Get all incidents
    const allIncidents = await Incident.find({}).sort('-createdAt').limit(20);
    console.log(`📊 Found ${allIncidents.length} total incidents`);
    
    // Get incidents with hospital assignments
    const hospitalIncidents = await Incident.find({
      'patientStatus.hospital': { $exists: true, $ne: null }
    });
    console.log(`🏥 Found ${hospitalIncidents.length} incidents with hospital assignments`);

    // Get completed incidents assigned to hospitals
    const completedHospitalIncidents = await Incident.find({
      status: 'completed',
      'patientStatus.hospital': { $exists: true, $ne: null }
    });
    console.log(`✅ Found ${completedHospitalIncidents.length} completed incidents with hospital assignments`);

    const responseData = {
      hospitalUsers: hospitalUsers.map(user => ({
        id: user._id,
        name: user.name,
        email: user.email,
        hospital: user.hospital,
        role: user.role
      })),
      totalIncidents: allIncidents.length,
      hospitalAssignedIncidents: hospitalIncidents.length,
      completedHospitalIncidents: completedHospitalIncidents.length,
      recentIncidents: allIncidents.map(inc => ({
        id: inc._id,
        status: inc.status,
        hospitalStatus: inc.hospitalStatus,
        patientHospital: inc.patientStatus?.hospital,
        description: inc.description,
        assignedTo: inc.assignedTo
      })),
      hospitalIncidents: hospitalIncidents.map(inc => ({
        id: inc._id,
        status: inc.status,
        hospitalStatus: inc.hospitalStatus,
        patientHospital: inc.patientStatus?.hospital,
        description: inc.description,
        createdAt: inc.createdAt
      }))
    };

    console.log('📋 Debug response data prepared');
    
    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('❌ Error in hospital setup debug:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Debug endpoint for specific hospital
router.get('/debug/hospital-test/:hospitalName', async (req, res) => {
  try {
    const hospitalName = req.params.hospitalName;
    
    const incidents = await Incident.find({
      'patientStatus.hospital': hospitalName
    });

    const incoming = incidents.filter(inc => 
      inc.status === 'completed' && 
      inc.hospitalStatus === 'pending'
    );

    const received = incidents.filter(inc => 
      inc.status === 'completed' && 
      inc.hospitalStatus === 'admitted'
    );

    res.json({
      success: true,
      data: {
        hospitalName,
        totalIncidents: incidents.length,
        incomingCases: incoming.length,
        receivedCases: received.length,
        allIncidents: incidents.map(inc => ({
          id: inc._id,
          status: inc.status,
          hospitalStatus: inc.hospitalStatus,
          patientHospital: inc.patientStatus?.hospital,
          assignedDriver: inc.assignedTo?.driver
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Driver incidents route
router.get('/driver/my-incidents', protect, authorize('driver', 'superadmin'), getDriverIncidents);

// Debug endpoint for department
router.get('/debug/department/:department', async (req, res) => {
  try {
    const { department } = req.params;
    
    const incidents = await Incident.find({
      'assignedTo.department': department
    }).populate('reportedBy', 'name email phone');
    
    console.log(`🔍 Debug: Found ${incidents.length} incidents for department: ${department}`);
    
    incidents.forEach(incident => {
      console.log(`📋 Incident: ${incident._id}, Status: ${incident.status}, Department: ${incident.assignedTo?.department}`);
    });

    res.json({
      success: true,
      department: department,
      count: incidents.length,
      incidents: incidents
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Debug endpoint for driver assignments
router.get('/debug/driver-assignments/:driverId', async (req, res) => {
  try {
    const { driverId } = req.params;
    
    const incidents = await Incident.find({
      'assignedTo.driver': driverId
    })
    .populate('reportedBy', 'name email phone')
    .populate('assignedTo.driver', 'name email department');
    
    console.log(`🔍 Debug: Found ${incidents.length} incidents for driver: ${driverId}`);
    
    incidents.forEach(incident => {
      console.log(`📋 Incident: ${incident._id}, Status: ${incident.status}, Driver: ${incident.assignedTo?.driver?.name}`);
    });

    res.json({
      success: true,
      driverId: driverId,
      count: incidents.length,
      incidents: incidents
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Action routes
router.put('/:id/approve', protect, authorize('admin', 'superadmin'), approveIncident);
router.put('/:id/reject', protect, authorize('admin', 'superadmin'), rejectIncident);
router.put('/:id/assign', protect, authorize('department', 'admin', 'superadmin'), assignDriver);
router.put('/:id/status', protect, updateIncidentStatus);

module.exports = router;