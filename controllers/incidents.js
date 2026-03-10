const mongoose = require('mongoose');
const Incident = require('../models/Incident');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AlertService = require('../services/alertService');
const GeocodingService = require('../services/geocodingService');

// @desc    Get all incidents - COMPLETELY FIXED VERSION
// @route   GET /api/incidents
// @access  Private
exports.getIncidents = async (req, res, next) => {
  try {
    console.log('🔍 GET /api/incidents called by:', {
      userId: req.user.id,
      role: req.user.role,
      department: req.user.department
    });

    const { 
      status, 
      priority, 
      category, 
      page = 1, 
      limit = 10, 
      sort = '-createdAt', 
      search, 
      hospital 
    } = req.query;

    // Build base filter based on user role
    let baseFilter = {};

    if (req.user.role === 'citizen') {
      baseFilter.reportedBy = req.user.id;
    } else if (req.user.role === 'driver') {
      console.log('🚗 Driver query for user ID:', req.user.id);
      
      // IMPORTANT: Try to use ObjectId if valid, otherwise use string
      let driverId;
      try {
        if (mongoose.Types.ObjectId.isValid(req.user.id)) {
          driverId = new mongoose.Types.ObjectId(req.user.id);
          baseFilter['assignedTo.driver'] = driverId;
        } else {
          baseFilter['assignedTo.driver'] = req.user.id;
        }
      } catch (err) {
        console.log('⚠️ Error with driver ID, using string:', err.message);
        baseFilter['assignedTo.driver'] = req.user.id;
      }
      
      // Only show active incidents for drivers
      baseFilter.status = { $in: ['assigned', 'in_progress'] };
      
    } else if (req.user.role === 'department') {
  console.log('🏢 Department query for:', req.user.department);
  
  // Show approved incidents (available to all depts) OR incidents assigned to this specific dept
  baseFilter.$or = [
    { status: 'approved', 'assignedTo.department': { $exists: false } }, // available to all
    { 'assignedTo.department': req.user.department }                       // assigned to this dept
  ];
  baseFilter.status = { $in: ['approved', 'assigned', 'in_progress'] };
}else if (req.user.role === 'hospital') {
      if (req.user.hospital) {
        baseFilter['patientStatus.hospital'] = req.user.hospital;
      }
    } else if (req.user.role === 'superadmin' || req.user.role === 'admin') {
      // Admins can see all incidents - no filter needed
      console.log('👑 Admin viewing all incidents');
    } else {
      // Default for unknown roles
      baseFilter._id = null; // Will return empty
    }

    // Apply additional filters from query parameters
    if (status && status !== 'all') {
      baseFilter.status = status;
    }
    
    if (priority) {
      baseFilter.priority = priority;
    }
    
    if (category) {
      baseFilter.category = category;
    }
    
    if (hospital) {
      baseFilter['patientStatus.hospital'] = hospital;
    }

    // Build the query
    let query = Incident.find(baseFilter);

    // Apply search if provided
    if (search) {
      query = query.or([
        { description: { $regex: search, $options: 'i' } },
        { 'reportedBy.name': { $regex: search, $options: 'i' } },
        { 'assignedTo.department': { $regex: search, $options: 'i' } }
      ]);
    }

    // Apply pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination
    const total = await Incident.countDocuments(query.getFilter());

    // Execute query with population and sorting
    const incidents = await query
      .skip(skip)
      .limit(limitNum)
      .populate('reportedBy', 'name email phone')
      .populate('assignedTo.driver', 'name phone')
      .populate('actions.performedBy', 'name role')
      .sort(sort);

    console.log(`✅ Found ${incidents.length} incidents for ${req.user.role}`);

    return res.status(200).json({
      success: true,
      count: incidents.length,
      total,
      pagination: {
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum
      },
      data: incidents
    });

  } catch (error) {
    console.error('❌ CRITICAL ERROR in getIncidents:', error);
    console.error('❌ Error stack:', error.stack);
    
    // Return a proper error response
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching incidents',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Update patient pickup status
// @route   PUT /api/incidents/:id/patient-pickup
// @access  Private (Driver)
exports.updatePatientPickupStatus = async (req, res, next) => {
  try {
    const { pickupStatus, notes } = req.body;
    const incidentId = req.params.id;
    
    console.log('🚑 Patient Pickup Status Update:', {
      incidentId,
      driverId: req.user.id,
      pickupStatus,
      notes
    });

    // Find incident
    const incident = await Incident.findById(incidentId);
    
    if (!incident) {
      console.log('❌ Incident not found:', incidentId);
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    // Verify driver is assigned to this incident
    const assignedDriverId = incident.assignedTo?.driver?.toString();
    const currentDriverId = req.user.id.toString();
    
    if (!assignedDriverId || assignedDriverId !== currentDriverId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this incident'
      });
    }

    // Validate pickup status
    const validStatuses = ['picked_up', 'taken_by_someone', 'expired'];
    if (!validStatuses.includes(pickupStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid pickup status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Update patient pickup status
    incident.patientPickupStatus = pickupStatus;
    
    // Add pickup notes if provided
    if (notes) {
      incident.patientPickupNotes = notes;
    }

    // Add action log
    incident.actions.push({
      action: `patient_pickup_${pickupStatus}`,
      performedBy: req.user.id,
      details: { 
        pickupStatus,
        notes
      },
      timestamp: new Date()
    });

    // Handle status transitions based on pickup status
    if (pickupStatus === 'picked_up') {
      // Patient picked up, continue to transporting status
      incident.driverStatus = 'transporting';
      if (!incident.timestamps) incident.timestamps = {};
      incident.timestamps.patientPickedUpAt = new Date();
      
      console.log(`✅ Patient picked up by driver`);
    } else if (pickupStatus === 'taken_by_someone') {
      // Patient taken by someone else, incident can be completed
      incident.driverStatus = 'completed';
      incident.status = 'completed';
      if (!incident.timestamps) incident.timestamps = {};
      incident.timestamps.completedAt = new Date();
      
      console.log(`ℹ️ Patient taken by someone else, incident completed`);
    } else if (pickupStatus === 'expired') {
      // Patient expired, incident completed
      incident.driverStatus = 'completed';
      incident.status = 'completed';
      if (!incident.timestamps) incident.timestamps = {};
      incident.timestamps.completedAt = new Date();
      
      console.log(`💔 Patient expired, incident completed`);
    }

    await incident.save();
    
    // Populate for response
    await incident.populate('reportedBy', 'name email phone');
    await incident.populate('assignedTo.driver', 'name phone');

    console.log(`✅ Patient pickup status updated successfully: ${pickupStatus}`);

    // Emit real-time update if WebSocket is available
    if (req.io) {
      req.io.emit('patientPickupUpdated', incident);
    }

    res.status(200).json({
      success: true,
      data: incident,
      message: `Patient pickup status updated to ${pickupStatus}`
    });
  } catch (error) {
    console.error('❌ Error updating patient pickup status:', error);
    console.error('❌ Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error updating patient pickup status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get incidents for hospital - ENHANCED VERSION
// @route   GET /api/incidents/hospital/incidents
// @access  Private (Hospital)
exports.getHospitalIncidents = async (req, res, next) => {
  try {
    const hospital = req.user.hospital;
    
    if (!hospital) {
      return res.status(400).json({
        success: false,
        message: 'Hospital information not found for user'
      });
    }

    console.log(`🏥 Loading incidents for hospital: "${hospital}"`);

    // Normalize hospital name
    let normalizedHospital = hospital;
    if (hospital === 'Hospital') {
      normalizedHospital = 'Jinnah Hospital';
      console.log(`🔧 Normalized hospital name: ${hospital} -> ${normalizedHospital}`);
    }

    // Get all incidents for this hospital
    const incidents = await Incident.find({
      'patientStatus.hospital': normalizedHospital,
      status: 'completed' // Only show completed incidents at hospital
    })
    .populate('reportedBy', 'name email phone')
    .populate('assignedTo.driver', 'name phone')
    .populate('actions.performedBy', 'name role')
    .sort('-createdAt');

    console.log(`✅ Found ${incidents.length} total incidents for hospital`);

    // Categorize by hospitalStatus
    const categorized = {
      incoming: incidents.filter(i => i.hospitalStatus === 'incoming'),
      admitted: incidents.filter(i => i.hospitalStatus === 'admitted'),
      discharged: incidents.filter(i => i.hospitalStatus === 'discharged'),
      pending: incidents.filter(i => i.hospitalStatus === 'pending')
    };

    console.log(`📊 Categorized:`, {
      incoming: categorized.incoming.length,
      admitted: categorized.admitted.length,
      discharged: categorized.discharged.length,
      pending: categorized.pending.length
    });

    // Return the structured data
    res.status(200).json({
      success: true,
      data: {
        incoming: categorized.incoming,
        admitted: categorized.admitted,
        discharged: categorized.discharged,
        pending: categorized.pending,
        hospitalName: normalizedHospital,
        total: incidents.length
      }
    });
  } catch (error) {
    console.error('❌ Error in hospital incidents:', error);
    next(error);
  }
};

// @desc    Fix hospital status for existing incidents
// @route   PUT /api/incidents/fix-hospital-status
// @access  Private (Hospital/Admin)
exports.fixHospitalStatus = async (req, res, next) => {
  try {
    console.log('🔧 Fixing hospital status for existing incidents...');
    
    // Update all incidents with hospital assignment but wrong status
    const result = await Incident.updateMany(
      { 
        'patientStatus.hospital': { $exists: true, $ne: null },
        'hospitalStatus': 'pending'
      },
      { 
        $set: { 
          'hospitalStatus': 'incoming',
          'status': 'completed'
        } 
      }
    );

    console.log(`✅ Fixed ${result.modifiedCount} incidents`);

    res.status(200).json({
      success: true,
      message: `Fixed ${result.modifiedCount} incidents`,
      fixedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('❌ Error fixing hospital status:', error);
    next(error);
  }
};

exports.debugHospitalEndpoint = async (req, res, next) => {
  try {
    const hospital = req.user.hospital;
    
    console.log(`🔍 DEBUG HOSPITAL ENDPOINT: Hospital = "${hospital}"`);
    
    // Test the exact same query as getHospitalIncidents
    const normalizedHospital = hospital === 'Hospital' ? 'Jinnah Hospital' : hospital;
    
    console.log(`🔍 Normalized hospital: "${normalizedHospital}"`);
    
    const incidents = await Incident.find({
      'patientStatus.hospital': normalizedHospital,
      'hospitalStatus': { $in: ['pending', 'incoming', 'admitted', 'discharged'] }
    })
    .populate('reportedBy', 'name email phone')
    .populate('assignedTo.driver', 'name phone')
    .populate('actions.performedBy', 'name role')
    .sort('-createdAt');

    console.log(`🔍 Found ${incidents.length} incidents with hospital query`);
    
    // Log each incident to see what's being returned
    incidents.forEach((incident, index) => {
      console.log(`🔍 Incident ${index + 1}:`, {
        id: incident._id,
        hospitalStatus: incident.hospitalStatus,
        patientHospital: incident.patientStatus?.hospital,
        status: incident.status
      });
    });

    // Categorize
    const categorized = {
      incoming: incidents.filter(i => i.hospitalStatus === 'pending' || i.hospitalStatus === 'incoming'),
      admitted: incidents.filter(i => i.hospitalStatus === 'admitted'),
      discharged: incidents.filter(i => i.hospitalStatus === 'discharged')
    };

    console.log(`🔍 Categorized:`, {
      incoming: categorized.incoming.length,
      admitted: categorized.admitted.length,
      discharged: categorized.discharged.length
    });

    res.status(200).json({
      success: true,
      data: {
        incoming: categorized.incoming,
        admitted: categorized.admitted,
        discharged: categorized.discharged,
        hospitalName: normalizedHospital,
        debug: {
          totalIncidents: incidents.length,
          hospitalQuery: normalizedHospital,
          incidents: incidents.map(inc => ({
            id: inc._id,
            hospitalStatus: inc.hospitalStatus,
            patientHospital: inc.patientStatus?.hospital,
            status: inc.status
          }))
        }
      }
    });
  } catch (error) {
    console.error('❌ Error in debug hospital endpoint:', error);
    next(error);
  }
};

// @desc    Debug hospital incidents query
// @route   GET /api/incidents/debug/hospital-query
// @access  Private (Hospital)
exports.debugHospitalQuery = async (req, res, next) => {
  try {
    const hospital = req.user.hospital;
    
    console.log(`🔍 DEBUG: Hospital query for "${hospital}"`);
    
    // Test different queries
    const queries = {
      'Current query (incoming only)': await Incident.find({
        'patientStatus.hospital': hospital,
        'hospitalStatus': 'incoming'
      }),
      'Pending status': await Incident.find({
        'patientStatus.hospital': hospital,
        'hospitalStatus': 'pending'
      }),
      'All hospital assignments': await Incident.find({
        'patientStatus.hospital': hospital
      }),
      'Updated query (both pending and incoming)': await Incident.find({
        'patientStatus.hospital': hospital,
        'hospitalStatus': { $in: ['pending', 'incoming'] }
      })
    };

    const results = {};
    for (const [queryName, result] of Object.entries(queries)) {
      results[queryName] = {
        count: result.length,
        incidents: result.map(inc => ({
          id: inc._id,
          status: inc.status,
          hospitalStatus: inc.hospitalStatus,
          patientHospital: inc.patientStatus?.hospital
        }))
      };
    }

    res.status(200).json({
      success: true,
      hospital: hospital,
      queries: results
    });
  } catch (error) {
    console.error('❌ Error in debug hospital query:', error);
    next(error);
  }
};

// @desc    Create proper hospital test data
// @route   POST /api/incidents/create-hospital-test-data
// @access  Private (Hospital/Admin)
exports.createHospitalTestData = async (req, res, next) => {
  try {
    const User = require('../models/User');
    
    // Find users
    const driver = await User.findOne({ role: 'driver' });
    const citizen = await User.findOne({ role: 'citizen' });
    const hospitalUser = await User.findOne({ role: 'hospital' });
    
    if (!driver || !citizen) {
      return res.status(400).json({
        success: false,
        message: 'Need driver and citizen users to create test incidents'
      });
    }

    console.log('🏥 Creating PROPER hospital test data for:', hospitalUser?.hospital);

    // Create test incidents with proper hospital workflow status
    const testIncidents = [
      // Incoming case
      {
        reportedBy: citizen._id,
        description: 'Car accident with minor injuries - Patient stable',
        category: 'Accident',
        priority: 'high',
        location: {
          type: 'Point',
          coordinates: [67.0822, 24.9056],
          address: 'Gulshan-e-Iqbal, Karachi'
        },
        status: 'completed',
        departmentStatus: 'completed',
        hospitalStatus: 'incoming',
        driverStatus: 'delivered',
        assignedTo: {
          department: 'Edhi Foundation',
          driver: driver._id,
          assignedAt: new Date(Date.now() - 30 * 60 * 1000)
        },
        patientStatus: {
          condition: 'Stable - Minor injuries',
          hospital: 'Jinnah Hospital',
          updatedAt: new Date()
        },
        timestamps: {
          completedAt: new Date(Date.now() - 25 * 60 * 1000),
          deliveredAt: new Date(Date.now() - 5 * 60 * 1000)
        }
      },
      // Admitted case
      {
        reportedBy: citizen._id,
        description: 'Heart attack case - Critical condition',
        category: 'Accident',
        priority: 'urgent',
        location: {
          type: 'Point',
          coordinates: [67.0645, 24.8932],
          address: 'Bahadurabad, Karachi'
        },
        status: 'completed',
        departmentStatus: 'completed',
        hospitalStatus: 'admitted',
        driverStatus: 'completed',
        assignedTo: {
          department: 'Chippa Ambulance',
          driver: driver._id,
          assignedAt: new Date(Date.now() - 3 * 60 * 60 * 1000)
        },
        patientStatus: {
          condition: 'Critical - Heart attack',
          hospital: 'Jinnah Hospital',
          medicalNotes: 'Patient admitted to ICU',
          treatment: 'Emergency cardiac care',
          doctor: 'Dr. Ahmed',
          bedNumber: 'ICU-12',
          updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
        },
        timestamps: {
          completedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          admittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
        }
      }
    ];

    // Create all incidents
    const createdIncidents = await Incident.insertMany(testIncidents);

    console.log(`✅ Created ${createdIncidents.length} PROPER hospital test incidents`);

    res.status(201).json({
      success: true,
      message: `Created ${createdIncidents.length} hospital test incidents with proper workflow status`,
      data: {
        incoming: 1,
        admitted: 1,
        discharged: 0
      }
    });
  } catch (error) {
    console.error('❌ Error creating hospital test data:', error);
    next(error);
  }
};
// @desc    Get incidents by driver status
// @route   GET /api/incidents/driver/status/:status
// @access  Private (Driver)
exports.getIncidentsByDriverStatus = async (req, res, next) => {
  try {
    const { status } = req.params;
    const driverId = req.user.id;

    console.log(`🚗 Getting incidents for driver ${driverId} with status: ${status}`);

    const incidents = await Incident.find({
      'assignedTo.driver': driverId,
      driverStatus: status
    })
    .populate('reportedBy', 'name email phone')
    .populate('assignedTo.driver', 'name phone')
    .sort('-createdAt');

    console.log(`✅ Found ${incidents.length} incidents with driver status: ${status}`);

    res.status(200).json({
      success: true,
      count: incidents.length,
      data: incidents
    });
  } catch (error) {
    console.error('❌ Error getting incidents by driver status:', error);
    next(error);
  }
};
// @desc    Update driver workflow status - FIXED VERSION
// @route   PUT /api/incidents/:id/driver-status
// @access  Private (Driver)
exports.updateDriverStatus = async (req, res, next) => {
  try {
    const { status, hospital, patientCondition } = req.body;
    const incidentId = req.params.id;
    
    console.log('🚑 Driver Status Update Request:', {
      incidentId,
      driverId: req.user.id,
      status,
      hospital,
      patientCondition
    });

    // Find incident
    const incident = await Incident.findById(incidentId);
    
    if (!incident) {
      console.log('❌ Incident not found:', incidentId);
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    // Verify driver is assigned to this incident
    const assignedDriverId = incident.assignedTo?.driver?.toString();
    const currentDriverId = req.user.id.toString();
    
    console.log('🔍 Driver verification:', {
      assignedDriverId,
      currentDriverId,
      match: assignedDriverId === currentDriverId
    });

    if (!assignedDriverId || assignedDriverId !== currentDriverId) {
      console.log('❌ Driver not authorized:', {
        assignedDriverId,
        currentDriverId,
        incidentId
      });
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this incident'
      });
    }

    // Validate status
    const validStatuses = ['arrived', 'transporting', 'delivered', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Update driver status
    incident.driverStatus = status;
    
    // Handle hospital assignment when transporting
    if (status === 'transporting' && hospital) {
      // Normalize hospital name
      let normalizedHospital = hospital;
      if (hospital === 'Hospital') {
        normalizedHospital = 'Jinnah Hospital';
      }

      incident.patientStatus = {
        ...incident.patientStatus,
        condition: patientCondition || 'Being transported to hospital',
        hospital: normalizedHospital,
        updatedAt: new Date()
      };

      console.log(`🚑 Patient assigned to hospital: ${normalizedHospital}`);
    }

    // 🚨 CRITICAL FIX: When delivered, set hospitalStatus to 'incoming' for hospital dashboard
    if (status === 'delivered') {
      // Use existing hospital or get from request
      const hospitalName = hospital || incident.patientStatus?.hospital || 'Jinnah Hospital';
      
      // Ensure hospital status is set to 'incoming' so it appears in hospital dashboard
      incident.hospitalStatus = 'incoming';
      
      // Ensure incident status is 'completed' for driver workflow
      incident.status = 'completed';
      incident.driverStatus = 'completed';
      
      // Update patient status with hospital assignment
      incident.patientStatus = {
        condition: patientCondition || 'Delivered to hospital',
        hospital: hospitalName,
        updatedAt: new Date()
      };

      console.log(`🏥 Incident ${incident._id} delivered to hospital: ${hospitalName}`);
      console.log(`📊 Hospital status set to: ${incident.hospitalStatus}`);
    }

    // Handle final completion
    if (status === 'completed') {
      incident.status = 'completed';
      incident.driverStatus = 'completed';
      console.log(`🎉 Incident completed: ${incident._id}`);
    }

    // Add action log
    incident.actions.push({
      action: `driver_${status}`,
      performedBy: req.user.id,
      details: { 
        hospital: hospital || incident.patientStatus?.hospital,
        patientCondition: patientCondition 
      },
      timestamp: new Date()
    });

    // Update timestamps
    if (!incident.timestamps) incident.timestamps = {};
    incident.timestamps.updatedAt = new Date();
    
    // Set specific timestamps based on status
    switch (status) {
      case 'arrived':
        incident.timestamps.arrivedAt = new Date();
        break;
      case 'transporting':
        incident.timestamps.transportingAt = new Date();
        break;
      case 'delivered':
        incident.timestamps.deliveredAt = new Date();
        incident.timestamps.completedAt = new Date();
        break;
      case 'completed':
        incident.timestamps.completedAt = new Date();
        break;
    }

    await incident.save();
    
    // Populate for response
    await incident.populate('reportedBy', 'name email phone');
    await incident.populate('assignedTo.driver', 'name phone');

    console.log(`✅ Driver status updated successfully: ${incident.driverStatus}`);
    console.log(`🏥 Final status for hospital:`, {
      hospitalStatus: incident.hospitalStatus,
      patientHospital: incident.patientStatus?.hospital,
      status: incident.status
    });

    // Emit real-time update if WebSocket is available
    if (req.io) {
      req.io.emit('incidentUpdated', incident);
    }

    res.status(200).json({
      success: true,
      data: incident,
      message: `Status updated to ${status}`
    });
  } catch (error) {
    console.error('❌ Error updating driver status:', error);
    console.error('❌ Error stack:', error.stack);
    
    // Check for specific MongoDB errors
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid incident ID format'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error updating driver status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Update hospital workflow status
// @route   PUT /api/incidents/:id/hospital-status
// @access  Private (Hospital)
exports.updateHospitalStatus = async (req, res, next) => {
  try {
    const { status, medicalNotes, treatment, doctor, bedNumber } = req.body;
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    // Verify hospital is assigned this incident
    if (incident.patientStatus?.hospital !== req.user.hospital) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this incident'
      });
    }

    const previousHospitalStatus = incident.hospitalStatus;

    console.log('🏥 Hospital Status Update:', {
      incidentId: incident._id,
      hospital: req.user.hospital,
      fromStatus: previousHospitalStatus,
      toStatus: status
    });

    // Validate status transition
    const validTransitions = {
      'incoming': ['admitted'],
      'admitted': ['discharged']
    };

    if (!validTransitions[previousHospitalStatus]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from ${previousHospitalStatus} to ${status}`
      });
    }

    // Update hospital status
    incident.hospitalStatus = status;

    // Update patient status with hospital details
    incident.patientStatus = {
      ...incident.patientStatus,
      medicalNotes,
      treatment,
      doctor,
      bedNumber,
      updatedAt: new Date()
    };

    // Add action log
    incident.actions.push({
      action: `hospital_${status}`,
      performedBy: req.user.id,
      details: { 
        medicalNotes,
        treatment,
        doctor,
        bedNumber
      },
      timestamp: new Date()
    });

    await incident.save();
    
    // Populate for response
    await incident.populate('reportedBy', 'name email phone');
    await incident.populate('assignedTo.driver', 'name phone');

    console.log(`✅ Hospital status updated successfully: ${previousHospitalStatus} → ${status}`);

    // Emit real-time update
    if (req.io) {
      req.io.emit('incidentUpdated', incident);
    }

    res.status(200).json({
      success: true,
      data: incident,
      message: `Patient status updated to ${status}`
    });
  } catch (error) {
    console.error('❌ Error updating hospital status:', error);
    next(error);
  }
};

// @desc    Get incidents by hospital status
// @route   GET /api/incidents/hospital/status/:status
// @access  Private (Hospital)
exports.getIncidentsByHospitalStatus = async (req, res, next) => {
  try {
    const { status } = req.params;
    const hospital = req.user.hospital;

    console.log(`🏥 Getting incidents for hospital ${hospital} with status: ${status}`);

    const incidents = await Incident.find({
      'patientStatus.hospital': hospital,
      hospitalStatus: status
    })
    .populate('reportedBy', 'name email phone')
    .populate('assignedTo.driver', 'name phone')
    .sort('-createdAt');

    console.log(`✅ Found ${incidents.length} incidents with hospital status: ${status}`);

    res.status(200).json({
      success: true,
      count: incidents.length,
      data: incidents
    });
  } catch (error) {
    console.error('❌ Error getting incidents by hospital status:', error);
    next(error);
  }
};

// @desc    Get driver dashboard with workflow status
// @route   GET /api/incidents/driver/workflow
// @access  Private (Driver)
exports.getDriverWorkflowDashboard = async (req, res, next) => {
  try {
    const driverId = req.user.id;

    console.log(`🚗 Getting workflow dashboard for driver: ${driverId}`);

    const [
      assignedIncidents,
      arrivedIncidents,
      transportingIncidents,
      deliveredIncidents,
      completedIncidents
    ] = await Promise.all([
      // Assigned incidents
      Incident.find({
        'assignedTo.driver': driverId,
        driverStatus: 'assigned'
      })
      .populate('reportedBy', 'name phone')
      .sort('-createdAt'),

      // Arrived incidents
      Incident.find({
        'assignedTo.driver': driverId,
        driverStatus: 'arrived'
      })
      .populate('reportedBy', 'name phone')
      .sort('-createdAt'),

      // Transporting incidents
      Incident.find({
        'assignedTo.driver': driverId,
        driverStatus: 'transporting'
      })
      .populate('reportedBy', 'name phone')
      .sort('-createdAt'),

      // Delivered incidents
      Incident.find({
        'assignedTo.driver': driverId,
        driverStatus: 'delivered'
      })
      .populate('reportedBy', 'name phone')
      .sort('-createdAt'),

      // Completed incidents
      Incident.find({
        'assignedTo.driver': driverId,
        driverStatus: 'completed'
      })
      .populate('reportedBy', 'name phone')
      .sort('-createdAt')
      .limit(10)
    ]);

    const stats = {
      assigned: assignedIncidents.length,
      arrived: arrivedIncidents.length,
      transporting: transportingIncidents.length,
      delivered: deliveredIncidents.length,
      completed: completedIncidents.length,
      totalActive: assignedIncidents.length + arrivedIncidents.length + transportingIncidents.length
    };

    res.status(200).json({
      success: true,
      data: {
        stats,
        incidents: {
          assigned: assignedIncidents,
          arrived: arrivedIncidents,
          transporting: transportingIncidents,
          delivered: deliveredIncidents,
          completed: completedIncidents
        }
      }
    });
  } catch (error) {
    console.error('❌ Error getting driver workflow dashboard:', error);
    next(error);
  }
};

// @desc    Get hospital dashboard with workflow status
// @route   GET /api/incidents/hospital/workflow
// @access  Private (Hospital)
exports.getHospitalWorkflowDashboard = async (req, res, next) => {
  try {
    const hospital = req.user.hospital;

    console.log(`🏥 Getting workflow dashboard for hospital: ${hospital}`);

    const [
      incomingIncidents,
      admittedIncidents,
      dischargedIncidents
    ] = await Promise.all([
      // Incoming incidents
      Incident.find({
        'patientStatus.hospital': hospital,
        hospitalStatus: 'incoming'
      })
      .populate('reportedBy', 'name phone')
      .populate('assignedTo.driver', 'name phone')
      .sort('-createdAt'),

      // Admitted incidents
      Incident.find({
        'patientStatus.hospital': hospital,
        hospitalStatus: 'admitted'
      })
      .populate('reportedBy', 'name phone')
      .populate('assignedTo.driver', 'name phone')
      .sort('-createdAt'),

      // Discharged incidents (last 24 hours)
      Incident.find({
        'patientStatus.hospital': hospital,
        hospitalStatus: 'discharged',
        updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      })
      .populate('reportedBy', 'name phone')
      .populate('assignedTo.driver', 'name phone')
      .sort('-updatedAt')
      .limit(20)
    ]);

    const stats = {
      incoming: incomingIncidents.length,
      admitted: admittedIncidents.length,
      discharged: dischargedIncidents.length,
      totalActive: incomingIncidents.length + admittedIncidents.length
    };

    res.status(200).json({
      success: true,
      data: {
        stats,
        hospital: hospital,
        incidents: {
          incoming: incomingIncidents,
          admitted: admittedIncidents,
          discharged: dischargedIncidents
        }
      }
    });
  } catch (error) {
    console.error('❌ Error getting hospital workflow dashboard:', error);
    next(error);
  }
};

// @desc    Debug hospital assignments - FIXED
// @route   GET /api/incidents/debug/hospital-assignments
// @access  Private (Hospital)
exports.debugHospitalAssignments = async (req, res, next) => {
  try {
    const hospital = req.user.hospital;
    
    if (!hospital) {
      return res.status(400).json({
        success: false,
        message: 'Hospital information not found for user'
      });
    }

    console.log(`🔍 Debugging hospital assignments for: "${hospital}"`);

    // Get all incidents with hospital assignments
    const allHospitalAssignments = await Incident.find({
      'patientStatus.hospital': { $exists: true, $ne: null }
    });

    // Get incidents assigned to this hospital
    const myHospitalIncidents = await Incident.find({
      'patientStatus.hospital': hospital
    });

    // Get completed incidents for this hospital
    const myCompletedIncidents = await Incident.find({
      'patientStatus.hospital': hospital,
      'status': 'completed'
    });

    res.status(200).json({
      success: true,
      data: {
        hospital: hospital,
        allHospitalAssignments: allHospitalAssignments.length,
        myHospitalIncidents: myHospitalIncidents.length,
        myCompletedIncidents: myCompletedIncidents.length,
        myIncidents: myHospitalIncidents.map(inc => ({
          id: inc._id,
          status: inc.status,
          hospitalStatus: inc.hospitalStatus,
          patientHospital: inc.patientStatus?.hospital,
          description: inc.description,
          createdAt: inc.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('❌ Error debugging hospital assignments:', error);
    next(error);
  }
};

// @desc    Direct test - get raw hospital incidents
// @route   GET /api/incidents/debug/hospital-raw
// @access  Private (Hospital)
// @desc    Direct test - get raw hospital incidents
// @route   GET /api/incidents/debug/hospital-raw
// @access  Private (Hospital)
exports.getRawHospitalIncidents = async (req, res, next) => {
  try {
    const hospital = req.user.hospital;
    
    console.log(`🔍 RAW DEBUG: Hospital = ${hospital}`);
    
    // Direct query - no processing
    const incidents = await Incident.find({
      'patientStatus.hospital': hospital,
      'status': 'completed'
    });

    console.log(`🔍 RAW DEBUG: Found ${incidents.length} incidents`);
    
    // Return raw data
    res.status(200).json({
      success: true,
      hospital: hospital,
      count: incidents.length,
      incidents: incidents, // Direct array
      rawData: incidents.map(inc => ({
        id: inc._id,
        status: inc.status,
        hospitalStatus: inc.hospitalStatus,
        patientHospital: inc.patientStatus?.hospital,
        description: inc.description
      }))
    });
  } catch (error) {
    console.error('❌ RAW DEBUG Error:', error);
    next(error);
  }
};

// @desc    Debug ALL hospital assignments in database
// @route   GET /api/incidents/debug/all-hospital-data
// @access  Private (Admin/Hospital)
exports.debugAllHospitalData = async (req, res, next) => {
  try {
    // Get ALL incidents with any hospital assignment
    const allHospitalIncidents = await Incident.find({
      'patientStatus.hospital': { $exists: true, $ne: null }
    });

    console.log(`🔍 ALL hospital assignments in DB: ${allHospitalIncidents.length}`);
    
    // Group by hospital
    const byHospital = {};
    allHospitalIncidents.forEach(inc => {
      const hospital = inc.patientStatus?.hospital;
      if (hospital) {
        if (!byHospital[hospital]) byHospital[hospital] = [];
        byHospital[hospital].push({
          id: inc._id,
          status: inc.status,
          hospitalStatus: inc.hospitalStatus,
          description: inc.description
        });
      }
    });

    res.status(200).json({
      success: true,
      totalHospitalAssignments: allHospitalIncidents.length,
      byHospital: byHospital,
      allIncidents: allHospitalIncidents.map(inc => ({
        id: inc._id,
        status: inc.status,
        hospitalStatus: inc.hospitalStatus,
        patientHospital: inc.patientStatus?.hospital,
        description: inc.description,
        createdAt: inc.createdAt
      }))
    });
  } catch (error) {
    console.error('❌ Error debugging all hospital data:', error);
    next(error);
  }
};

// @desc    Create REAL test hospital incidents
// @route   POST /api/incidents/create-real-hospital-data
// @access  Private (Admin/Hospital)
exports.createRealHospitalData = async (req, res, next) => {
  try {
    const User = require('../models/User');
    
    // Find users
    const driver = await User.findOne({ role: 'driver' });
    const citizen = await User.findOne({ role: 'citizen' });
    const hospitalUser = await User.findOne({ role: 'hospital' });
    
    if (!driver || !citizen) {
      return res.status(400).json({
        success: false,
        message: 'Need driver and citizen users to create test incidents'
      });
    }

    console.log('🏥 Creating REAL hospital incidents for:', hospitalUser?.hospital);

    // Create multiple test incidents with proper hospital assignment
    const testIncidents = [
      {
        reportedBy: citizen._id,
        description: 'Car accident with minor injuries - Patient stable',
        category: 'Accident',
        priority: 'high',
        location: {
          type: 'Point',
          coordinates: [67.0822, 24.9056],
          address: 'Gulshan-e-Iqbal, Karachi'
        },
        status: 'completed',
        departmentStatus: 'completed',
        hospitalStatus: 'pending',
        assignedTo: {
          department: 'Edhi Foundation',
          driver: driver._id,
          assignedAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
        },
        patientStatus: {
          condition: 'Stable - Minor injuries',
          hospital: 'Jinnah Hospital', // MUST MATCH EXACTLY
          updatedAt: new Date()
        },
        timestamps: {
          completedAt: new Date(Date.now() - 30 * 60 * 1000),
          hospitalArrivalAt: new Date()
        }
      },
      {
        reportedBy: citizen._id,
        description: 'Heart attack case - Critical condition',
        category: 'Accident',
        priority: 'urgent',
        location: {
          type: 'Point',
          coordinates: [67.0645, 24.8932],
          address: 'Bahadurabad, Karachi'
        },
        status: 'completed',
        departmentStatus: 'completed', 
        hospitalStatus: 'admitted',
        assignedTo: {
          department: 'Chippa Ambulance',
          driver: driver._id,
          assignedAt: new Date(Date.now() - 3 * 60 * 60 * 1000)
        },
        patientStatus: {
          condition: 'Critical - Heart attack',
          hospital: 'Jinnah Hospital', // MUST MATCH EXACTLY
          updatedAt: new Date(Date.now() - 45 * 60 * 1000)
        },
        timestamps: {
          completedAt: new Date(Date.now() - 90 * 60 * 1000),
          hospitalArrivalAt: new Date(Date.now() - 45 * 60 * 1000)
        }
      },
      {
        reportedBy: citizen._id,
        description: 'Fractured leg from fall',
        category: 'Accident',
        priority: 'medium',
        location: {
          type: 'Point',
          coordinates: [67.0991, 24.9176],
          address: 'PECHS, Karachi'
        },
        status: 'completed',
        departmentStatus: 'completed',
        hospitalStatus: 'discharged',
        assignedTo: {
          department: 'Edhi Foundation',
          driver: driver._id,
          assignedAt: new Date(Date.now() - 5 * 60 * 60 * 1000)
        },
        patientStatus: {
          condition: 'Treated - Fractured leg',
          hospital: 'Jinnah Hospital', // MUST MATCH EXACTLY
          updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
        },
        timestamps: {
          completedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
          hospitalArrivalAt: new Date(Date.now() - 3 * 60 * 60 * 1000)
        }
      }
    ];

    // Create all incidents
    const createdIncidents = await Incident.insertMany(testIncidents);

    console.log(`✅ Created ${createdIncidents.length} REAL hospital incidents`);

    // Verify they were created
    const verifyIncidents = await Incident.find({
      'patientStatus.hospital': 'Jinnah Hospital'
    });

    console.log(`🔍 Verification: Found ${verifyIncidents.length} incidents for Jinnah Hospital`);

    res.status(201).json({
      success: true,
      message: `Created ${createdIncidents.length} real hospital incidents`,
      createdCount: createdIncidents.length,
      verifyCount: verifyIncidents.length,
      incidents: verifyIncidents.map(inc => ({
        id: inc._id,
        status: inc.status,
        hospitalStatus: inc.hospitalStatus,
        patientHospital: inc.patientStatus?.hospital,
        description: inc.description
      }))
    });
  } catch (error) {
    console.error('❌ Error creating real hospital data:', error);
    next(error);
  }
};

// @desc    Direct test - get raw hospital incidents
// @route   GET /api/incidents/debug/hospital-raw
// @access  Private (Hospital)
exports.getRawHospitalIncidents = async (req, res, next) => {
  try {
    const hospital = req.user.hospital;
    
    console.log(`🔍 RAW DEBUG: Hospital = ${hospital}`);
    
    // Direct query - no processing
    const incidents = await Incident.find({
      'patientStatus.hospital': hospital,
      'status': 'completed'
    });

    console.log(`🔍 RAW DEBUG: Found ${incidents.length} incidents`);
    
    // Return raw data
    res.status(200).json({
      success: true,
      hospital: hospital,
      count: incidents.length,
      incidents: incidents, // Direct array
      rawData: incidents.map(inc => ({
        id: inc._id,
        status: inc.status,
        hospitalStatus: inc.hospitalStatus,
        patientHospital: inc.patientStatus?.hospital,
        description: inc.description
      }))
    });
  } catch (error) {
    console.error('❌ RAW DEBUG Error:', error);
    next(error);
  }
};

// @desc    Get single incident
// @route   GET /api/incidents/:id
// @access  Private
exports.getIncident = async (req, res, next) => {
  try {
    let incident = await Incident.findById(req.params.id)
      .populate('reportedBy', 'name email phone')
      .populate('assignedTo.driver', 'name phone')
      .populate('actions.performedBy', 'name role');

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    // Check if user has access to this incident
    if (!canAccessIncident(req.user, incident)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this incident'
      });
    }

    res.status(200).json({
      success: true,
      data: incident
    });
  } catch (error) {
    next(error);
  }
};

exports.createIncident = async (req, res, next) => {
  try {
    // Step 1: Set user
    req.body.reportedBy = req.user.id;

    // Step 2: FIX LOCATION - handles all formats from multipart
    try {
      let loc = req.body.location;

      // If it's a string, try JSON parse first
      if (typeof loc === 'string') {
        try { 
          loc = JSON.parse(loc); 
          console.log('📍 Parsed location from JSON string');
        } catch(e) {
          console.log('📍 Not JSON, will try other parsing');
        }
      }

      // If coordinates is still a string like "67.111,24.909" or "[67.111,24.909]"
      if (loc && typeof loc.coordinates === 'string') {
        const cleaned = loc.coordinates.replace(/[\[\]\s]/g, ''); // remove [], spaces
        const parts = cleaned.split(',').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          loc.coordinates = parts;
          console.log('📍 Fixed coordinates from string:', loc.coordinates);
        }
      }

      // Ensure type is always Point
      loc.type = 'Point';

      // If address missing, set fallback (geocoding will update it below)
      if (!loc.address) {
        loc.address = 'Address resolving...';
      }

      req.body.location = loc;
      console.log('📍 Location after fix:', JSON.stringify(req.body.location));

    } catch (locationError) {
      console.error('❌ Location parse error:', locationError.message);
      return res.status(400).json({
        success: false,
        message: 'Invalid location data provided',
        error: locationError.message
      });
    }

    // Step 3: Set defaults
    if (!req.body.category) req.body.category = 'Accident';
    if (!req.body.priority) req.body.priority = 'high';
    if (!req.body.description || req.body.description.trim() === '') {
      req.body.description = 'Accident reported with photo';
    }

    // Step 4: Handle file uploads
    console.log('📝 Creating incident with data:', {
      reportedBy: req.user.id,
      hasFiles: !!req.files,
      fileCount: req.files?.length || 0
    });

    if (req.files && req.files.length > 0) {
      console.log('📸 Processing GridFS uploaded files:', req.files.length);

      req.files.forEach((file, index) => {
        console.log(`📁 File ${index + 1}:`, {
          filename: file.filename,
          originalname: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
        });
      });

      req.body.photos = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: new Date(),
        url: `/api/upload/image/${file.filename}`
      }));
    }

    // Step 5: AI detection score
    req.body.aiDetectionScore = Math.floor(Math.random() * 100);

    // Step 6: Get real address from coordinates using geocoding
    if (
      req.body.location &&
      Array.isArray(req.body.location.coordinates) &&
      req.body.location.coordinates.length === 2
    ) {
      const [longitude, latitude] = req.body.location.coordinates;
      console.log(`📍 Getting address for: ${latitude}, ${longitude}`);

      try {
        const address = await GeocodingService.getAddressFromCoordinates(latitude, longitude);
        req.body.location.address = address;
        console.log(`📍 Address resolved: ${address}`);
      } catch (geoError) {
        console.log('⚠️ Geocoding failed, using fallback address:', geoError.message);
        req.body.location.address = `${latitude}, ${longitude}`; // coordinates as fallback
      }

      req.body.location.rawCoordinates = { latitude, longitude };
    }

    console.log('🚀 Creating incident with final data:', {
      category: req.body.category,
      priority: req.body.priority,
      description: req.body.description,
      photosCount: req.body.photos?.length || 0,
      location: req.body.location
    });

    // Step 7: Create incident
    const incident = await Incident.create(req.body);

    // Step 8: Add creation action log
    incident.actions.push({
      action: 'created',
      performedBy: req.user.id,
      details: { status: 'pending' }
    });
    await incident.save();

    // Step 9: Populate response
    await incident.populate('reportedBy', 'name email phone');

    // Step 10: Send alerts
    await AlertService.sendEmergencyAlerts(incident._id);

    // Step 11: Emit real-time update
    if (req.io) {
      req.io.to('admins').emit('newIncident', incident); // 👈 targeted
    }

    console.log('✅ Incident created successfully:', {
      incidentId: incident._id,
      photoCount: incident.photos?.length || 0,
      location: incident.location?.address
    });

    res.status(201).json({
      success: true,
      data: incident
    });

  } catch (error) {
    console.error('❌ Error creating incident:', error.message);
    next(error);
  }
};
// @desc    Update incident
// @route   PUT /api/incidents/:id
// @access  Private
exports.updateIncident = async (req, res, next) => {
  try {
    let incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    // Handle hospital status updates
    if (req.body.hospitalStatus) {
      incident.hospitalStatus = req.body.hospitalStatus;
      
      // Add action log for hospital status change
      incident.actions.push({
        action: 'hospital_status_updated',
        performedBy: req.user.id,
        details: { 
          hospitalStatus: req.body.hospitalStatus,
          condition: req.body.patientStatus?.condition 
        }
      });
    }

    // Handle patient status updates
    if (req.body.patientStatus) {
      incident.patientStatus = {
        ...incident.patientStatus,
        ...req.body.patientStatus,
        updatedAt: new Date()
      };
    }

    await incident.save();
    
    // Populate for response
    await incident.populate('reportedBy', 'name email phone');
    await incident.populate('assignedTo.driver', 'name phone');

    // Emit real-time update
    if (req.io) {
      req.io.emit('incidentUpdated', incident);
    }

    res.status(200).json({
      success: true,
      data: incident
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve incident
// @route   PUT /api/incidents/:id/approve
// @access  Private (Admin/SuperAdmin)
// @desc    Approve incident
// @route   PUT /api/incidents/:id/approve
// @access  Private (Admin/SuperAdmin)


// Server-side assignment controller
class IncidentAssignmentController {
  constructor() {
    this.pendingIncidents = new Map(); // incidentId -> { timer, nearestDepartment }
  }

  async approveIncident(incidentId) {
    const incident = await Incident.findById(incidentId);
    
    // Calculate distances for all departments
    const departmentDistances = await this.calculateDistancesForAllDepartments(incident);
    
    // Sort by distance
    const sorted = departmentDistances.sort((a, b) => a.distance - b.distance);
    
    // Store in memory with timer
    this.pendingIncidents.set(incidentId, {
      incident,
      sortedDepartments: sorted,
      nearest: sorted[0],
      claimedBy: null,
      timeout: setTimeout(() => this.handleAssignmentTimeout(incidentId), 15000) // 15 seconds
    });

    // Notify ALL departments with distance information
    this.notifyDepartments(incidentId, sorted);
    
    return {
      success: true,
      message: 'Incident available for assignment',
      distances: sorted
    };
  }

  async calculateDistancesForAllDepartments(incident) {
    const departments = await Department.find({ active: true });
    const incidentLat = incident.location.coordinates[1];
    const incidentLng = incident.location.coordinates[0];
    
    const distances = [];
    
    for (const dept of departments) {
      // Get all active drivers for this department
      const drivers = await User.find({
        role: 'driver',
        department: dept.name,
        status: 'active'
      }).select('name location status');
      
      // Find closest driver in this department
      let minDistance = Infinity;
      let closestDriver = null;
      
      for (const driver of drivers) {
        if (driver.location && driver.location.coordinates) {
          const distance = this.calculateDistance(
            incidentLat, incidentLng,
            driver.location.coordinates[1], driver.location.coordinates[0]
          );
          
          if (distance < minDistance) {
            minDistance = distance;
            closestDriver = driver;
          }
        }
      }
      
      distances.push({
        department: dept.name,
        distance: minDistance === Infinity ? null : minDistance,
        closestDriver: closestDriver ? {
          id: closestDriver._id,
          name: closestDriver.name,
          distance: minDistance
        } : null,
        availableDrivers: drivers.length
      });
    }
    
    return distances.filter(d => d.distance !== null);
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  async handleAssignmentTimeout(incidentId) {
    const pending = this.pendingIncidents.get(incidentId);
    if (!pending || pending.claimedBy) return;
    
    // No one claimed - make it available to all
    this.pendingIncidents.delete(incidentId);
    
    // Notify all departments it's now open
    this.notifyOpenToAll(incidentId);
  }

  async claimIncident(incidentId, departmentName, driverId) {
    const pending = this.pendingIncidents.get(incidentId);
    
    if (!pending) {
      return { success: false, message: 'Incident no longer available' };
    }
    
    // Check if already claimed
    if (pending.claimedBy) {
      return { 
        success: false, 
        message: `Already claimed by ${pending.claimedBy}`,
        claimedBy: pending.claimedBy
      };
    }
    
    // Check if this department is the nearest
    const isNearest = pending.nearest.department === departmentName;
    const timeSinceApproval = Date.now() - pending.incident.assignedTo.assignedAt;
    
    // If nearest department, allow immediate claim
    if (isNearest) {
      clearTimeout(pending.timeout);
      pending.claimedBy = departmentName;
      
      // Assign to driver
      await this.assignToDriver(incidentId, departmentName, driverId);
      
      // Notify others it's taken
      this.notifyClaimed(incidentId, departmentName);
      
      return { 
        success: true, 
        message: 'Incident claimed (nearest department)',
        priority: 'nearest'
      };
    }
    
    // If not nearest, wait 10 seconds before allowing
    if (timeSinceApproval < 10000) {
      return {
        success: false,
        message: `Nearest department (${pending.nearest.department}) has priority for 10 more seconds`,
        waitTime: 10000 - timeSinceApproval,
        nearestDepartment: pending.nearest.department,
        nearestDistance: pending.nearest.distance
      };
    }
    
    // After 10 seconds, allow any department to claim
    clearTimeout(pending.timeout);
    pending.claimedBy = departmentName;
    
    await this.assignToDriver(incidentId, departmentName, driverId);
    this.notifyClaimed(incidentId, departmentName);
    
    return { 
      success: true, 
      message: 'Incident claimed (after priority window)',
      priority: 'standard'
    };
  }

  async assignToDriver(incidentId, departmentName, driverId) {
    const incident = await Incident.findById(incidentId);
    
    incident.assignedTo = {
      department: departmentName,
      driver: driverId,
      assignedAt: new Date(),
      assignmentType: 'department_claimed'
    };
    
    incident.status = 'assigned';
    await incident.save();
    
    // Notify driver
    // ...
  }

  notifyDepartments(incidentId, distances) {
    // Emit to all departments with distance info
    if (global.io) {
      global.io.to('departments').emit('incidentAvailable', {
        incidentId,
        distances,
        yourRank: 'Will be calculated per department',
        priorityWindow: 10000
      });
    }
  }

  notifyClaimed(incidentId, claimedBy) {
    if (global.io) {
      global.io.to('departments').emit('incidentClaimed', {
        incidentId,
        claimedBy,
        message: `Incident claimed by ${claimedBy}`
      });
    }
  }

  notifyOpenToAll(incidentId) {
    if (global.io) {
      global.io.to('departments').emit('incidentOpenToAll', {
        incidentId,
        message: 'Incident now available to all departments'
      });
    }
  }
}

// Initialize controller
const assignmentController = new IncidentAssignmentController();
// In incidentController.js
exports.approveIncident = async (req, res, next) => {
  try {
    const incident = await Incident.findById(req.params.id);

    if (!incident || incident.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid incident' 
      });
    }

    // Approve incident
    incident.status = 'approved';
    incident.assignedTo = {
      assignedAt: new Date(),
      assignedBy: req.user.id
    };

    incident.actions.push({
      action: 'approved',
      performedBy: req.user.id,
      details: { reason: req.body.reason || 'Approved by admin' }
    });

    await incident.save();
    await incident.populate('reportedBy', 'name email phone');

    // Add to assignment queue
    const queueResult = await req.assignmentQueue.addIncidentToQueue(incident);

     if (req.io) {
      console.log(`📡 Emitting incidentApproved to departments for incident: ${incident._id}`);
      
      // Emit to all departments
      req.io.to('departments').emit('incidentApproved', incident);}
    console.log(`✅ Incident ${incident._id} approved and added to queue`);

    res.status(200).json({
      success: true,
      data: incident,
      queueStatus: queueResult ? {
        inQueue: true,
        bestETA: queueResult.bestDepartment?.bestETA,
        totalDepartments: queueResult.departments.length
      } : { inQueue: false, reason: 'No available drivers' }
    });

  } catch (error) {
    console.error('Error approving incident:', error);
    next(error);
  }
};



// @desc    Driver accepts an assigned incident
// @route   PUT /api/incidents/:id/accept
// @access  Private (Driver)
   exports.acceptIncident = async (req, res, next) => {
  try {
    const incidentId = req.params.id;
    const driverId = req.user.id;

    console.log(`✅ Driver ${driverId} accepting incident ${incidentId}`);

    const incident = await Incident.findById(incidentId);

    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    const assignedDriverId = incident.assignedTo?.driver?.toString();
    const currentDriverId = driverId.toString();

    if (assignedDriverId !== currentDriverId) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this incident'
      });
    }

    // ✅ CRITICAL FIX: Clear the 2-minute timer so it doesn't fire after acceptance
    const rejectionTimerService = require('../services/rejectiontimer');
    const cleared = rejectionTimerService.clearTimer(incidentId);
    console.log(`⏱️ Timer cleared on acceptance: ${cleared}`);

    incident.driverStatus = 'assigned';

    incident.actions.push({
      action: 'driver_accepted',
      performedBy: driverId,
      details: { message: 'Driver accepted the incident' },
      timestamp: new Date()
    });

    await incident.save();
    await incident.populate('reportedBy', 'name email phone');
    await incident.populate('assignedTo.driver', 'name phone');

    if (req.io) {
      req.io.to('departments').emit('incidentUpdated', incident);
      req.io.to(`dept_${incident.assignedTo?.department}`).emit('driverAccepted', {
        incidentId: incident._id,
        driverName: req.user.name,
        message: 'Driver has accepted the incident'
      });
    }

    console.log(`✅ Incident ${incidentId} accepted by driver ${driverId}`);

    return res.status(200).json({
      success: true,
      data: incident,
      message: 'Incident accepted successfully'
    });

  } catch (error) {
    console.error('❌ Error accepting incident:', error);
    next(error);
  }
};

// // @desc    Driver rejects an assigned incident
// // @route   PUT /api/incidents/:id/reject
// // @access  Private (Driver)
// exports.rejectIncidentDriver = async (req, res, next) => {
//   try {
//     const incidentId = req.params.id;
//     const driverId = req.user.id;
//     const { reason } = req.body;

//     console.log(`❌ Driver ${driverId} rejecting incident ${incidentId}`);

//     const incident = await Incident.findById(incidentId);

//     if (!incident) {
//       return res.status(404).json({ success: false, message: 'Incident not found' });
//     }

//     const assignedDriverId = incident.assignedTo?.driver?.toString();
//     if (assignedDriverId !== driverId.toString()) {
//       return res.status(403).json({
//         success: false,
//         message: 'You are not assigned to this incident'
//       });
//     }

//     const departmentName = incident.assignedTo?.department;

//     // Unassign the driver and revert to approved status
//     incident.assignedTo = {
//       department: departmentName,  // keep department, remove driver
//       assignedAt: incident.assignedTo?.assignedAt,
//       assignedBy: incident.assignedTo?.assignedBy
//     };
//     incident.status = 'approved';
//     incident.driverStatus = undefined;

//     incident.actions.push({
//       action: 'driver_rejected',
//       performedBy: driverId,
//       details: { reason: reason || 'Driver rejected the incident' },
//       timestamp: new Date()
//     });

//     await incident.save();
//     await incident.populate('reportedBy', 'name email phone');

//     // Notify department so they can reassign
//     if (req.io) {
//       req.io.to('departments').emit('incidentUpdated', incident);
//       req.io.to(`dept_${departmentName}`).emit('driverRejected', {
//         incidentId: incident._id,
//         driverName: req.user.name,
//         reason: reason || 'No reason provided',
//         message: 'Driver rejected the incident — please reassign'
//       });
//     }

//     console.log(`✅ Incident ${incidentId} rejected by driver, returned to department`);

//     return res.status(200).json({
//       success: true,
//       data: incident,
//       message: 'Incident rejected successfully'
//     });

//   } catch (error) {
//     console.error('❌ Error rejecting incident:', error);
//     next(error);
//   }
// };
// New endpoint for claiming incident
exports.claimIncident = async (req, res, next) => {
  try {
    const { incidentId, driverId } = req.body;
    const departmentName = req.user.department;
    
    const result = await req.assignmentQueue.claimIncident(
      incidentId, 
      departmentName, 
      driverId
    );
    
    res.json({
      success: result.success,
      message: result.message,
      data: result
    });
    
  } catch (error) {
    console.error('Claim error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
// exports.approveIncident = async (req, res, next) => {
//   try {
//     const incident = await Incident.findById(req.params.id);

//     if (!incident) {
//       return res.status(404).json({
//         success: false,
//         message: 'Incident not found'
//       });
//     }

//     if (incident.status !== 'pending') {
//       return res.status(400).json({
//         success: false,
//         message: `Incident is already ${incident.status}`
//       });
//     }

//     // Simply approve — no department assignment
//     incident.status = 'approved';
//     incident.assignedTo = {
//       assignedAt: new Date(),
//       assignedBy: req.user.id
//     };

//     incident.actions.push({
//       action: 'approved',
//       performedBy: req.user.id,
//       details: { reason: req.body.reason || 'Approved by admin' }
//     });

//     await incident.save();
//     await incident.populate('reportedBy', 'name email phone');

//     console.log(`✅ Incident ${incident._id} approved — broadcasting to ALL departments`);

//     // Notify ALL department users (not just one)
//     const departmentUsers = await User.find({
//       role: 'department',
//       status: 'active'
//     });

//     for (const user of departmentUsers) {
//       await Notification.create({
//         recipient: user._id,
//         title: 'New Incident Approved',
//         message: `A new ${incident.category} incident is available for assignment.`,
//         type: 'assignment',
//         relatedIncident: incident._id
//       });
//     }

//     // Emit to ALL departments via socket
//     if (req.io) {
//       // Check connected sockets
//       const roomSockets = await req.io.in('departments').fetchSockets();
//       console.log(`📡 Departments room has ${roomSockets.length} connected sockets`);
      
//       // Emit to departments room
//       req.io.to('departments').emit('incidentApproved', incident);
//       console.log(`✅ Emitted incidentApproved to departments room`);
      
//       // Also emit to admins
//       req.io.to('admins').emit('incidentApproved', incident);
//     }

//     res.status(200).json({
//       success: true,
//       data: incident,
//       message: 'Incident approved and broadcasted to all departments'
//     });
//   } catch (error) {
//     console.error('Error approving incident:', error);
//     next(error);
//   }
// };
// @desc    Assign incident to department
// @route   PUT /api/incidents/:id/assign
// @access  Private (Admin/SuperAdmin)
exports.assignToDepartment = async (req, res, next) => {
  try {
    const { department } = req.body;
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    incident.assignedTo = {
      department: department,
      assignedAt: new Date()
    };
    incident.status = 'assigned';

    incident.actions.push({
      action: 'assigned_to_department',
      performedBy: req.user.id,
      details: { department: department }
    });

    await incident.save();

    res.status(200).json({
      success: true,
      data: incident
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reject incident
// @route   PUT /api/incidents/:id/reject
// @access  Private (Admin/SuperAdmin)
exports.rejectIncident = async (req, res, next) => {
  try {
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    incident.status = 'rejected';
    incident.actions.push({
      action: 'rejected',
      performedBy: req.user.id,
      details: { reason: req.body.reason }
    });

    await incident.save();

    // Notify the reporter
    await Notification.create({
      recipient: incident.reportedBy,
      title: 'Incident Rejected',
      message: `Your incident #${incident._id} has been rejected. Reason: ${req.body.reason}`,
      type: 'status_update',
      relatedIncident: incident._id
    });

    // Emit real-time update
    if (req.io) {
req.io.to(`citizen_${incident.reportedBy}`).emit('incidentRejected', incident);
    }

    res.status(200).json({
      success: true,
      data: incident
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get hospital dashboard data - ENHANCED VERSION
// @route   GET /api/dashboard/hospital
// @access  Private (Hospital)
exports.getHospitalDashboard = async (req, res, next) => {
  try {
    // Check if user and hospital info exists
    if (!req.user || !req.user.hospital) {
      return res.status(400).json({
        success: false,
        message: 'Hospital information not found for user'
      });
    }

    const hospital = req.user.hospital;

    // Normalize hospital name
    let normalizedHospital = hospital;
    if (hospital === 'Hospital') {
      normalizedHospital = 'Jinnah Hospital';
    }

    console.log(`🏥 Getting dashboard data for hospital: ${normalizedHospital}`);

    const [
      incomingIncidents,
      admittedIncidents,
      dischargedIncidents,
      hospitalStats
    ] = await Promise.all([
      // Incoming cases - incidents with hospitalStatus = 'incoming'
      Incident.find({
        'patientStatus.hospital': normalizedHospital,
        hospitalStatus: 'incoming'
      })
      .populate('reportedBy', 'name phone')
      .populate('assignedTo.driver', 'name phone')
      .sort('-createdAt'),
      
      // Admitted cases
      Incident.find({
        'patientStatus.hospital': normalizedHospital,
        hospitalStatus: 'admitted'
      })
      .populate('reportedBy', 'name phone')
      .populate('assignedTo.driver', 'name phone')
      .sort('-createdAt'),
      
      // Discharged cases (last 7 days)
      Incident.find({
        'patientStatus.hospital': normalizedHospital,
        hospitalStatus: 'discharged',
        updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
      .populate('reportedBy', 'name phone')
      .populate('assignedTo.driver', 'name phone')
      .sort('-updatedAt'),
      
      // Hospital statistics
      Incident.aggregate([
        { $match: { 'patientStatus.hospital': normalizedHospital } },
        {
          $group: {
            _id: '$hospitalStatus',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Calculate today's admissions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayAdmissions = await Incident.countDocuments({
      'patientStatus.hospital': normalizedHospital,
      hospitalStatus: 'admitted',
      'timestamps.admittedAt': { $gte: today }
    });

    res.status(200).json({
      success: true,
      data: {
        incomingCases: incomingIncidents.length,
        admittedCases: admittedIncidents.length,
        dischargedCases: dischargedIncidents.length,
        todayAdmissions,
        hospitalStats,
        incomingIncidents,
        admittedIncidents,
        dischargedIncidents,
        hospitalName: normalizedHospital,
        totalCases: incomingIncidents.length + admittedIncidents.length + dischargedIncidents.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Assign driver to incident - ENHANCED VERSION
// @route   PUT /api/incidents/:id/assign
// @access  Private (Department/Admin/SuperAdmin)
// @desc    Assign driver to incident - ENHANCED VERSION with 2-minute timer
// @route   PUT /api/incidents/:id/assign
// @access  Private (Department/Admin/SuperAdmin)
exports.assignDriver = async (req, res, next) => {
  try {
    const { driverId } = req.body;
    
    // Load the rejection timer service
    const rejectionTimerService = require('../services/rejectiontimer');
    
    // Initialize timer service with io if not already done
    if (req.io && !rejectionTimerService.io) {
      rejectionTimerService.initialize(req.io);
      console.log('✅ RejectionTimerService initialized with Socket.IO');
    }

    console.log(`🚗 Assigning driver ${driverId} to incident ${req.params.id} by department ${req.user.department}`);

    // 🔒 ATOMIC CHECK — prevent double assignment
    const incident = await Incident.findOneAndUpdate(
      { 
        _id: req.params.id,
        // Only assign if NOT already claimed by a department
        $or: [
          { 'assignedTo.driver': { $exists: false } },
          { 'assignedTo.driver': null }
        ]
      },
      { 
        $set: { 
          'assignedTo.claimedAt': new Date(),
          'assignedTo.department': req.user.department 
        } 
      },
      { new: false } // return original to check if it was unclaimed
    );

    // If null — another department already claimed it
    if (!incident) {
      const takenIncident = await Incident.findById(req.params.id)
        .populate('assignedTo.driver', 'name');
      
      console.log(`⚠️ Incident already claimed by ${takenIncident?.assignedTo?.department}`);
      
      return res.status(409).json({
        success: false,
        message: `Incident already claimed by ${takenIncident?.assignedTo?.department}`,
        takenBy: takenIncident?.assignedTo?.department
      });
    }

    // Verify driver exists and is a driver
    const driver = await User.findById(driverId);
    if (!driver || driver.role !== 'driver') {
      console.log(`❌ Invalid driver ID: ${driverId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid driver ID'
      });
    }

    console.log(`✅ Driver found: ${driver.name} (${driver.department})`);

    // Initialize rejectedDrivers array if not present
    if (!incident.rejectedDrivers) {
      incident.rejectedDrivers = [];
    }

    // Now do the full assignment
    incident.assignedTo = {
      department: req.user.department,
      driver: driverId,
      assignedAt: new Date(),
      assignedBy: req.user.id,
      driverName: driver.name
    };

    incident.status = 'assigned';
    incident.departmentStatus = 'assigned';
    incident.driverStatus = 'pending_acceptance'; // Driver must accept within 2 minutes

    incident.actions.push({
      action: 'driver_assigned',
      performedBy: req.user.id,
      details: { 
        driver: driverId,
        driverName: driver.name,
        department: req.user.department
      },
      timestamp: new Date()
    });

    await incident.save();
    
    // Populate for response
    await incident.populate('reportedBy', 'name email phone');
    await incident.populate('assignedTo.driver', 'name phone department');

    // Create database notification for the driver
    await Notification.create({
      recipient: driverId,
      title: 'New Incident Assigned',
      message: `You have been assigned to a ${incident.category} incident at ${incident.location?.address}`,
      type: 'assignment',
      relatedIncident: incident._id,
      data: {
        incidentId: incident._id,
        action: 'assignment',
        department: req.user.department
      }
    });

    // 📡 Emit socket events for real-time updates
    if (req.io) {
      // 1. Notify the specific driver in their personal room
      req.io.to(`driver_${driverId}`).emit('incidentAssigned', {
        incident: incident,
        eta: null,
        distance: null,
        message: 'New incident assigned to you',
        assignedAt: new Date().toISOString()
      });
      console.log(`📡 Emitted incidentAssigned to driver_${driverId}`);

      // 2. Notify ALL departments that this incident is taken (race finished)
      req.io.to('departments').emit('incidentClaimed', {
        incidentId: incident._id,
        claimedBy: req.user.department,
        driverName: driver.name,
        message: `Incident claimed by ${req.user.department}`
      });

      // 3. Notify the specific department that driver was assigned
      req.io.to(`dept_${req.user.department}`).emit('driverAssigned', {
        incidentId: incident._id,
        driverName: driver.name,
        driverId: driverId,
        message: `Driver ${driver.name} assigned to incident`
      });

      // 4. Notify admins
      req.io.to('admins').emit('driverAssigned', { 
        incident: incident, 
        driver: {
          _id: driver._id,
          name: driver.name,
          department: driver.department
        }
      });

      // 5. Notify citizen who reported (if citizen tracking)
      if (incident.reportedBy) {
        req.io.to(`citizen_${incident.reportedBy._id || incident.reportedBy}`).emit('incidentUpdated', {
          incidentId: incident._id,
          status: 'assigned',
          message: 'A driver has been assigned to your incident'
        });
      }
    }

    // ✅ Start 2-minute acceptance timer
    try {
      rejectionTimerService.startTimer(
        incident._id.toString(),
        driverId.toString(),
        req.user.department,
        async (incidentId, timedOutDriverId, dept, reason) => {
          // Timer fired — treat as rejection and reassign
          console.log(`🔄 TIMEOUT: Driver ${timedOutDriverId} did not respond within 2 minutes for incident ${incidentId}`);
          
          // Check if incident still exists and is still pending_acceptance
          const currentIncident = await Incident.findById(incidentId)
            .populate('assignedTo.driver', 'name');
          
          if (!currentIncident) {
            console.log(`❌ Incident ${incidentId} no longer exists, skipping reassignment`);
            return;
          }
          
          // Only auto-reassign if still pending_acceptance and same driver
          if (currentIncident.driverStatus === 'pending_acceptance' && 
              currentIncident.assignedTo?.driver?._id?.toString() === timedOutDriverId) {
            
            console.log(`🔄 Auto-reassigning incident ${incidentId} - driver ${timedOutDriverId} timed out`);
            
            // Call the reassignment function
            const User = require('../models/User');
            const timedOutDriver = await User.findById(timedOutDriverId);
            
            await _performReassignment(
              incidentId, 
              timedOutDriverId, 
              dept, 
              'timeout', 
              req.io,
              timedOutDriver?.name || 'Driver',
              'Driver did not respond within 2 minutes'
            );
          } else {
            console.log(`ℹ️ Incident ${incidentId} no longer pending (status: ${currentIncident.driverStatus})`);
          }
        }
      );
      console.log(`⏱️ Started 2-minute acceptance timer for incident ${incident._id}, driver ${driver.name}`);
    } catch (timerError) {
      console.error('❌ Error starting rejection timer:', timerError);
      // Continue even if timer fails - incident is still assigned
    }

    console.log(`✅ Driver ${driver.name} assigned successfully to incident ${incident._id}`);

    res.status(200).json({
      success: true,
      data: incident,
      message: `Driver ${driver.name} assigned successfully. 2-minute acceptance window started.`,
      timerStarted: true
    });

  } catch (error) {
    console.error('❌ Error assigning driver:', error);
    console.error('❌ Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error assigning driver',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Helper function for reassignment (make sure this is defined in your file)
async function _performReassignment(incidentId, rejectedDriverId, departmentName, rejectionType, io, driverName, reason) {
  try {
    const rejectionTimerService = require('../services/rejectiontimer');
    const User = require('../models/User');
    const Incident = require('../models/Incident');

    console.log(`🔄 Performing reassignment for incident ${incidentId}, rejected driver: ${rejectedDriverId}`);

    const incident = await Incident.findById(incidentId);
    if (!incident) {
      console.log(`❌ Incident ${incidentId} not found for reassignment`);
      return { success: false, message: 'Incident not found' };
    }


    // 🔥 SAFETY CHECK: Only reassign if still pending
if (incident.driverStatus !== 'pending_acceptance') {
  console.log(`ℹ️ Incident ${incidentId} no longer pending (status: ${incident.driverStatus}), skipping reassignment`);
  return;
}
    // Track all drivers who've rejected this incident
    const previouslyRejected = Array.isArray(incident.rejectedDrivers)
      ? [...incident.rejectedDrivers, rejectedDriverId.toString()]
      : [rejectedDriverId.toString()];

    const incidentLat = incident.location?.coordinates?.[1];
    const incidentLng = incident.location?.coordinates?.[0];

    // Try current department first
    let nextDriver = await findNextAvailableDriver(
      departmentName,
      previouslyRejected,
      incidentLat,
      incidentLng
    );

    let assignedDepartment = departmentName;

    // If no drivers in current department, try other departments
    if (!nextDriver) {
      console.log(`⚠️ No drivers left in ${departmentName}, checking other departments...`);
      
      // Get all other departments
      const allDepartments = await User.distinct('department', { 
        role: 'driver', 
        status: 'active' 
      });
      
      const otherDepartments = allDepartments.filter(dept => dept !== departmentName);
      console.log(`📋 Other departments available: ${otherDepartments.join(', ')}`);
      
      // Sort by distance to incident (find closest department with available drivers)
      const departmentsWithDistance = [];
      
      for (const dept of otherDepartments) {
        const deptDrivers = await User.find({
          role: 'driver',
          department: dept,
          status: 'active',
          _id: { $nin: previouslyRejected }
        }).select('name location _id department');
        
        if (deptDrivers.length > 0) {
          // Calculate closest driver in this department
          let minDistance = Infinity;
          for (const driver of deptDrivers) {
            if (driver.location?.coordinates?.length >= 2) {
              const dLat = driver.location.coordinates[1];
              const dLng = driver.location.coordinates[0];
              const dist = calculateHaversineDistance(incidentLat, incidentLng, dLat, dLng);
              if (dist < minDistance) {
                minDistance = dist;
              }
            }
          }
          
          departmentsWithDistance.push({
            department: dept,
            distance: minDistance,
            driverCount: deptDrivers.length
          });
        }
      }
      
      // Sort by distance
      departmentsWithDistance.sort((a, b) => a.distance - b.distance);
      
      if (departmentsWithDistance.length > 0) {
        // Try the closest other department
        const nextDepartment = departmentsWithDistance[0].department;
        console.log(`🔄 Trying next closest department: ${nextDepartment}`);
        
        nextDriver = await findNextAvailableDriver(
          nextDepartment,
          previouslyRejected,
          incidentLat,
          incidentLng
        );
        
        if (nextDriver) {
          assignedDepartment = nextDepartment; // Update department name for assignment
          console.log(`✅ Found driver ${nextDriver.name} in ${assignedDepartment}`);
        }
      }
    }

    if (nextDriver) {
      // ── Reassign to next closest driver ──────────────────────────────────
      incident.assignedTo = {
        department: assignedDepartment,
        driver: nextDriver._id,
        assignedAt: new Date(),
        assignedBy: incident.assignedTo?.assignedBy,
        driverName: nextDriver.name
      };
      incident.status = 'assigned';
      incident.departmentStatus = 'assigned';
      incident.driverStatus = 'pending_acceptance';
      incident.rejectedDrivers = previouslyRejected;

      incident.actions.push({
        action: 'auto_reassigned',
        performedBy: incident.assignedTo?.assignedBy || rejectedDriverId,
        details: {
          newDriver: nextDriver._id,
          newDriverName: nextDriver.name,
          newDepartment: assignedDepartment,
          previousDriver: rejectedDriverId,
          previousDepartment: departmentName,
          rejectionType,
          reason: reason || 'Previous driver rejected or timed out'
        },
        timestamp: new Date()
      });

      await incident.save();

      // Populate for emission
      await incident.populate('reportedBy', 'name email phone');
      await incident.populate('assignedTo.driver', 'name phone');

      // Create notification for new driver
      await Notification.create({
        recipient: nextDriver._id,
        title: 'New Incident Assigned',
        message: `You have been assigned to a ${incident.category} incident at ${incident.location?.address}`,
        type: 'assignment',
        relatedIncident: incident._id,
        data: {
          incidentId: incident._id,
          action: 'reassignment',
          department: assignedDepartment
        }
      });

      if (io) {
        // ✅ Notify new driver
        io.to(`driver_${nextDriver._id}`).emit('incidentAssigned', {
          incident: incident,
          eta: null,
          distance: null,
          message: `You are the next assigned driver for this ${incident.category} incident`,
          assignedAt: new Date().toISOString()
        });
        console.log(`📡 Reassigned — notified driver_${nextDriver._id} (${nextDriver.name})`);

        // ✅ Notify previous driver their rejection was processed
        io.to(`driver_${rejectedDriverId}`).emit('rejectionConfirmed', {
          incidentId: incidentId.toString(),
          message: 'Your rejection was processed. Incident reassigned.',
          reassignedTo: nextDriver.name,
          reassignedToDepartment: assignedDepartment
        });

        // ✅ Notify original department
        io.to(`dept_${departmentName}`).emit('driverRejected', {
          incidentId: incident._id,
          rejectedDriverName: driverName || 'Driver',
          reason: reason || rejectionType,
          reassignedTo: nextDriver.name,
          reassignedToDepartment: assignedDepartment,
          message: `Incident reassigned to ${nextDriver.name} (${assignedDepartment}) after rejection`,
        });

        // ✅ Notify new department
        io.to(`dept_${assignedDepartment}`).emit('incidentAssigned', {
          incidentId: incident._id,
          driverName: nextDriver.name,
          message: `New incident assigned to your department (reassigned from ${departmentName})`,
        });

        // ✅ Notify all departments to refresh
        io.to('departments').emit('incidentUpdated', incident);
        io.to('admins').emit('incidentUpdated', incident);

        // ✅ Start new 2-minute timer for the new driver
        rejectionTimerService.startTimer(
          incident._id.toString(),
          nextDriver._id.toString(),
          assignedDepartment,
          async (iId, tDriverId, dept) => {
            console.log(`🔄 New driver ${tDriverId} timed out, reassigning again...`);
            await _performReassignment(iId, tDriverId, dept, 'timeout', io);
          }
        );
      }

      console.log(`✅ Incident ${incidentId} reassigned to ${nextDriver.name} (${assignedDepartment}) [${rejectionType}]`);

      return {
        success: true,
        data: incident,
        message: `Incident reassigned to ${nextDriver.name} (${assignedDepartment})`,
        reassigned: true,
        newDriver: nextDriver.name,
        newDepartment: assignedDepartment,
        rejectionType,
        rejectedCount: previouslyRejected.length,
      };

    } else {
      // ── No more drivers ANYWHERE — return incident to admin pool ──────────────
      incident.assignedTo = {
        assignedAt: new Date(),
        assignedBy: incident.assignedTo?.assignedBy
      };
      incident.status = 'approved'; // Back to approved for admin to reassign
      incident.driverStatus = undefined;
      incident.departmentStatus = undefined;
      incident.rejectedDrivers = previouslyRejected;

      incident.actions.push({
        action: 'returned_to_admin',
        details: {
          reason: 'All drivers across all departments rejected or timed out',
          rejectedCount: previouslyRejected.length,
          lastDepartment: departmentName
        },
        timestamp: new Date()
      });

      await incident.save();

      if (io) {
        // Notify all departments that incident is back in admin queue
        io.to('departments').emit('incidentReturnedToAdmin', {
          incidentId: incident._id,
          message: 'No drivers available across departments. Incident returned to admin queue.',
        });

        // Notify admins
        io.to('admins').emit('incidentUpdated', incident);
      }

      console.log(`⚠️ No drivers available anywhere — incident ${incidentId} returned to admin pool`);

      return {
        success: true,
        data: incident,
        message: 'No drivers available. Incident returned to admin queue.',
        reassigned: false,
        rejectedCount: previouslyRejected.length,
      };
    }
  } catch (error) {
    console.error('❌ Error in _performReassignment:', error);
    return { success: false, message: error.message };
  }
}

// Helper function to find next available driver in a department
async function findNextAvailableDriver(departmentName, rejectedDriverIds, incidentLat, incidentLng) {
  const User = require('../models/User');

  console.log(`🔍 Finding next available driver in ${departmentName}, excluding ${rejectedDriverIds.length} rejected drivers`);

  // Get all active drivers in this department, excluding already-rejected ones
  const candidates = await User.find({
    role: 'driver',
    department: departmentName,
    status: 'active',
    _id: { $nin: rejectedDriverIds },
  }).select('name phone location _id department');

  if (candidates.length === 0) {
    console.log(`⚠️ No more drivers available in ${departmentName}`);
    return null;
  }

  console.log(`📊 Found ${candidates.length} candidate drivers in ${departmentName}`);

  // Sort by distance to incident if we have coordinates
  if (incidentLat != null && incidentLng != null && !isNaN(incidentLat) && !isNaN(incidentLng)) {
    const withDistance = candidates
      .filter(d => d.location?.coordinates?.length >= 2)
      .map(d => {
        const dLat = d.location.coordinates[1];
        const dLng = d.location.coordinates[0];
        const dist = calculateHaversineDistance(incidentLat, incidentLng, dLat, dLng);
        return { driver: d, distance: dist };
      })
      .sort((a, b) => a.distance - b.distance);

    if (withDistance.length > 0) {
      console.log(`🚗 Next closest driver: ${withDistance[0].driver.name} (${withDistance[0].distance.toFixed(2)} km)`);
      return withDistance[0].driver;
    }
  }

  // Fallback: return first available
  console.log(`🚗 No location data, picking first available: ${candidates[0].name}`);
  return candidates[0];
}

// Helper function to calculate Haversine distance
function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
// @desc    Get incidents for driver - UPDATED VERSION
// @route   GET /api/incidents/driver/my-incidents
// @access  Private (Driver)
// ─── 1. FIX: getDriverIncidents() — standalone function, no baseFilter ────────
exports.getDriverIncidents = async (req, res, next) => {
  try {
    console.log('🚗 Driver incidents request received for driver:', {
      id: req.user.id,
      name: req.user.name,
      role: req.user.role
    });

    let driverId;
    try {
      driverId = mongoose.Types.ObjectId.isValid(req.user.id)
        ? new mongoose.Types.ObjectId(req.user.id)
        : req.user.id;
    } catch (err) {
      driverId = req.user.id;
    }

    // ✅ Include pending_acceptance + active + completed
    const incidents = await Incident.find({
      'assignedTo.driver': driverId,
      $or: [
        { driverStatus: 'pending_acceptance' },
        { status: { $in: ['assigned', 'in_progress', 'completed'] } }
      ]
    })
    .populate('reportedBy', 'name email phone')
    .populate('assignedTo.driver', 'name phone department')
    .populate('actions.performedBy', 'name role')
    .sort('-createdAt');

    console.log(`✅ Found ${incidents.length} incidents for driver ${req.user.id}`);

    return res.status(200).json({
      success: true,
      count: incidents.length,
      driverId: req.user.id,
      data: incidents
    });

  } catch (error) {
    console.error('❌ Error getting driver incidents:', error);
    next(error);
  }
};

async function findNextAvailableDriver(departmentName, rejectedDriverIds, incidentLat, incidentLng) {
  const User = require('../models/User');

  // Get all active drivers in this department, excluding already-rejected ones
  const candidates = await User.find({
    role: 'driver',
    department: departmentName,
    status: 'active',
    _id: { $nin: rejectedDriverIds },
  }).select('name phone location _id department');

  if (candidates.length === 0) {
    console.log(`⚠️ No more drivers available in ${departmentName}`);
    return null;
  }

  // Sort by distance to incident if we have coordinates
  if (incidentLat != null && incidentLng != null) {
    const withDistance = candidates
      .filter(d => d.location?.coordinates?.length >= 2)
      .map(d => {
        const dLat = d.location.coordinates[1];
        const dLng = d.location.coordinates[0];
        const dist = calculateHaversineDistance(incidentLat, incidentLng, dLat, dLng);
        return { driver: d, distance: dist };
      })
      .sort((a, b) => a.distance - b.distance);

    if (withDistance.length > 0) {
      console.log(`🚗 Next closest driver: ${withDistance[0].driver.name} (${withDistance[0].distance.toFixed(2)} km)`);
      return withDistance[0].driver;
    }
  }

  // Fallback: return first available
  console.log(`🚗 No location data, picking first available: ${candidates[0].name}`);
  return candidates[0];
}

function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── UPDATED: assignDriver — starts 2-min timer after assignment ─────────────
exports.assignDriver = async (req, res, next) => {
  try {
    const { driverId } = req.body;
    const rejectionTimerService = require('../services/rejectiontimer');

    const incident = await Incident.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [
          { 'assignedTo.driver': { $exists: false } },
          { 'assignedTo.driver': null }
        ]
      },
      {
        $set: {
          'assignedTo.claimedAt': new Date(),
          'assignedTo.department': req.user.department
        }
      },
      { new: false }
    );

    if (!incident) {
      const takenIncident = await Incident.findById(req.params.id).populate('assignedTo.driver', 'name');
      return res.status(409).json({
        success: false,
        message: `Incident already claimed by ${takenIncident?.assignedTo?.department}`,
        takenBy: takenIncident?.assignedTo?.department
      });
    }

    const driver = await User.findById(driverId);
    if (!driver || driver.role !== 'driver') {
      return res.status(400).json({ success: false, message: 'Invalid driver ID' });
    }

    // Initialize rejectedDrivers array if not present
    if (!incident.rejectedDrivers) incident.rejectedDrivers = [];

    incident.assignedTo = {
      department: req.user.department,
      driver: driverId,
      assignedAt: new Date(),
      assignedBy: req.user.id,
      driverName: driver.name
    };

    incident.status = 'assigned';
    incident.departmentStatus = 'assigned';
    incident.driverStatus = 'pending_acceptance';

    incident.actions.push({
      action: 'driver_assigned',
      performedBy: req.user.id,
      details: {
        driver: driverId,
        driverName: driver.name,
        department: req.user.department
      },
      timestamp: new Date()
    });

    await incident.save();
    await incident.populate('reportedBy', 'name email phone');
    await incident.populate('assignedTo.driver', 'name phone department');

    await Notification.create({
      recipient: driverId,
      title: 'New Incident Assigned',
      message: `You have been assigned to a ${incident.category} incident at ${incident.location?.address}`,
      type: 'assignment',
      relatedIncident: incident._id
    });

    if (req.io) {
      req.io.to(`driver_${driverId}`).emit('incidentAssigned', {
        incident: incident,
        eta: null,
        distance: null,
      });
      console.log(`📡 Emitted incidentAssigned to driver_${driverId}`);

      req.io.to('departments').emit('incidentClaimed', {
        incidentId: incident._id,
        claimedBy: req.user.department,
        driverName: driver.name
      });

      req.io.to('admins').emit('driverAssigned', { incident, driver });
    }

    // ✅ Start 2-minute acceptance timer
    rejectionTimerService.startTimer(
      incident._id,
      driverId,
      req.user.department,
      async (incidentId, timedOutDriverId, dept, reason) => {
        // Timer fired — treat as rejection and reassign
        console.log(`🔄 Auto-reassigning incident ${incidentId} due to ${reason}`);
        await _performReassignment(incidentId, timedOutDriverId, dept, 'timeout', req.io);
      }
    );

    res.status(200).json({
      success: true,
      data: incident,
      message: `Driver ${driver.name} assigned successfully. 2-minute acceptance window started.`
    });

  } catch (error) {
    console.error('❌ Error assigning driver:', error);
    next(error);
  }
};

// ─── UPDATED: rejectIncidentDriver — sequential reassignment with 2-min check ─
exports.rejectIncidentDriver = async (req, res, next) => {
  try {
    const incidentId = req.params.id;
    const driverId = req.user.id;
    const { reason } = req.body;
    const rejectionTimerService = require('../services/rejectiontimer');

    console.log(`❌ Driver ${driverId} rejecting incident ${incidentId}`);

    const incident = await Incident.findById(incidentId);

    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    const assignedDriverId = incident.assignedTo?.driver?.toString();
    if (assignedDriverId !== driverId.toString()) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this incident' });
    }

    // ✅ Check if rejection is within 2-minute window
    const windowCheck = rejectionTimerService.checkRejectionWindow(incidentId, driverId);
    console.log(`⏱️ Rejection window check:`, windowCheck);

    // Clear the timer — driver responded (with rejection)
    rejectionTimerService.clearTimer(incidentId);

    // Log the rejection
    incident.actions.push({
      action: 'driver_rejected',
      performedBy: driverId,
      details: {
        reason: reason || 'Driver rejected',
        withinWindow: windowCheck.withinWindow,
        elapsedMs: windowCheck.elapsedMs,
      },
      timestamp: new Date()
    });

    await incident.save();

    // Perform sequential reassignment
    const result = await _performReassignment(
      incidentId,
      driverId,
      incident.assignedTo?.department,
      windowCheck.withinWindow ? 'within_window' : 'outside_window',
      req.io,
      req.user.name,
      reason
    );

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Error rejecting incident:', error);
    next(error);
  }
};

// ─── SHARED: Perform the actual sequential reassignment ──────────────────────
// ─── SHARED: Perform the actual sequential reassignment ──────────────────────
async function _performReassignment(incidentId, rejectedDriverId, departmentName, rejectionType, io, driverName, reason) {
  try {
    const rejectionTimerService = require('../services/rejectiontimer');
    const User = require('../models/User');

    const incident = await Incident.findById(incidentId);
    if (!incident) {
      console.log(`❌ Incident ${incidentId} not found for reassignment`);
      return { success: false, message: 'Incident not found' };
    }

    // Track all drivers who've rejected this incident
    const previouslyRejected = Array.isArray(incident.rejectedDrivers)
      ? [...incident.rejectedDrivers, rejectedDriverId.toString()]
      : [rejectedDriverId.toString()];

    const incidentLat = incident.location?.coordinates?.[1];
    const incidentLng = incident.location?.coordinates?.[0];

    // Try current department first
    let nextDriver = await findNextAvailableDriver(
      departmentName,
      previouslyRejected,
      incidentLat,
      incidentLng
    );

    // If no drivers in current department, try other departments
    if (!nextDriver) {
      console.log(`⚠️ No drivers left in ${departmentName}, checking other departments...`);
      
      // Get all other departments
      const allDepartments = await User.distinct('department', { 
        role: 'driver', 
        status: 'active' 
      });
      
      const otherDepartments = allDepartments.filter(dept => dept !== departmentName);
      
      // Sort by distance to incident (find closest department with available drivers)
      const departmentsWithDistance = [];
      
      for (const dept of otherDepartments) {
        const deptDrivers = await User.find({
          role: 'driver',
          department: dept,
          status: 'active',
          _id: { $nin: previouslyRejected }
        }).select('name location _id department');
        
        if (deptDrivers.length > 0) {
          // Calculate closest driver in this department
          let minDistance = Infinity;
          for (const driver of deptDrivers) {
            if (driver.location?.coordinates?.length >= 2) {
              const dLat = driver.location.coordinates[1];
              const dLng = driver.location.coordinates[0];
              const dist = calculateHaversineDistance(incidentLat, incidentLng, dLat, dLng);
              if (dist < minDistance) {
                minDistance = dist;
              }
            }
          }
          
          departmentsWithDistance.push({
            department: dept,
            distance: minDistance,
            driverCount: deptDrivers.length
          });
        }
      }
      
      // Sort by distance
      departmentsWithDistance.sort((a, b) => a.distance - b.distance);
      
      if (departmentsWithDistance.length > 0) {
        // Try the closest other department
        const nextDepartment = departmentsWithDistance[0].department;
        console.log(`🔄 Trying next closest department: ${nextDepartment}`);
        
        nextDriver = await findNextAvailableDriver(
          nextDepartment,
          previouslyRejected,
          incidentLat,
          incidentLng
        );
        
        if (nextDriver) {
          departmentName = nextDepartment; // Update department name for assignment
        }
      }
    }

    if (nextDriver) {
      // ── Reassign to next closest driver ──────────────────────────────────
      incident.assignedTo = {
        department: departmentName, // This could be a different department now
        driver: nextDriver._id,
        assignedAt: new Date(),
        assignedBy: incident.assignedTo?.assignedBy,
        driverName: nextDriver.name
      };
      incident.status = 'assigned';
      incident.departmentStatus = 'assigned';
      incident.driverStatus = 'pending_acceptance';
      incident.rejectedDrivers = previouslyRejected;

      incident.actions.push({
        action: 'auto_reassigned',
        performedBy: incident.assignedTo?.assignedBy || rejectedDriverId,
        details: {
          newDriver: nextDriver._id,
          newDriverName: nextDriver.name,
          newDepartment: departmentName,
          previousDriver: rejectedDriverId,
          previousDepartment: incident.assignedTo?.department,
          rejectionType,
          reason: reason || 'Previous driver rejected or timed out'
        },
        timestamp: new Date()
      });

      await incident.save();

      // Populate for emission
      await incident.populate('reportedBy', 'name email phone');
      await incident.populate('assignedTo.driver', 'name phone');

      // Create notification for new driver
      await Notification.create({
        recipient: nextDriver._id,
        title: 'New Incident Assigned',
        message: `You have been assigned to a ${incident.category} incident at ${incident.location?.address}`,
        type: 'assignment',
        relatedIncident: incident._id
      });

      if (io) {
        // ✅ Notify new driver
        io.to(`driver_${nextDriver._id}`).emit('incidentAssigned', {
          incident: incident,
          eta: null,
          distance: null,
          message: `You are the next assigned driver for this ${incident.category} incident`,
        });
        console.log(`📡 Reassigned — notified driver_${nextDriver._id} (${nextDriver.name})`);

        // ✅ Notify previous driver their rejection was processed
        io.to(`driver_${rejectedDriverId}`).emit('rejectionConfirmed', {
          incidentId: incidentId.toString(),
          message: 'Your rejection was processed. Incident reassigned.',
        });

        // ✅ Notify original department
        io.to(`dept_${incident.assignedTo?.department}`).emit('driverRejected', {
          incidentId: incident._id,
          rejectedDriverName: driverName || 'Driver',
          reason: reason || rejectionType,
          reassignedTo: nextDriver.name,
          reassignedToDepartment: departmentName,
          message: `Incident reassigned to ${nextDriver.name} (${departmentName}) after rejection`,
        });

        // ✅ Notify department dashboard to refresh
        io.to('departments').emit('incidentUpdated', incident);
        io.to('admins').emit('incidentUpdated', incident);

        // ✅ Start new 2-minute timer for the new driver
        rejectionTimerService.startTimer(
          incident._id,
          nextDriver._id,
          departmentName,
          async (iId, tDriverId, dept) => {
            console.log(`🔄 New driver ${tDriverId} timed out, reassigning again...`);
            await _performReassignment(iId, tDriverId, dept, 'timeout', io);
          }
        );
      }

      console.log(`✅ Incident ${incidentId} reassigned to ${nextDriver.name} (${departmentName}) [${rejectionType}]`);

      return {
        success: true,
        data: incident,
        message: `Incident reassigned to ${nextDriver.name} (${departmentName})`,
        reassigned: true,
        newDriver: nextDriver.name,
        newDepartment: departmentName,
        rejectionType,
        rejectedCount: previouslyRejected.length,
      };

    } else {
      // ── No more drivers ANYWHERE — return incident to admin pool ──────────────
      incident.assignedTo = {
        assignedAt: new Date(),
        assignedBy: incident.assignedTo?.assignedBy
      };
      incident.status = 'approved'; // Back to approved for admin to reassign
      incident.driverStatus = undefined;
      incident.departmentStatus = undefined;
      incident.rejectedDrivers = previouslyRejected;

      incident.actions.push({
        action: 'returned_to_admin',
        details: {
          reason: 'All drivers across all departments rejected or timed out',
          rejectedCount: previouslyRejected.length,
          lastDepartment: departmentName
        },
        timestamp: new Date()
      });

      await incident.save();

      if (io) {
        // Notify all departments that incident is back in admin queue
        io.to('departments').emit('incidentReturnedToAdmin', {
          incidentId: incident._id,
          message: 'No drivers available across departments. Incident returned to admin queue.',
        });

        // Notify admins
        io.to('admins').emit('incidentUpdated', incident);
      }

      console.log(`⚠️ No drivers available anywhere — incident ${incidentId} returned to admin pool`);

      return {
        success: true,
        data: incident,
        message: 'No drivers available. Incident returned to admin queue.',
        reassigned: false,
        rejectedCount: previouslyRejected.length,
      };
    }
  } catch (error) {
    console.error('❌ Error in _performReassignment:', error);
    return { success: false, message: error.message };
  }
}
// @desc    Get incidents for any driver (Super Admin only)
// @route   GET /api/admin/driver-incidents/:driverId
// @access  Private (SuperAdmin)
exports.getDriverIncidentsForSuperAdmin = async (req, res, next) => {
  try {
    const { driverId } = req.params;
    
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only super admin can access this endpoint'
      });
    }

    console.log(`👑 Super Admin viewing incidents for driver: ${driverId}`);

    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    const incidents = await Incident.find({
      'assignedTo.driver': driverId,
      status: { $in: ['assigned', 'in_progress', 'completed'] }
    })
    .populate('reportedBy', 'name email phone')
    .populate('assignedTo.driver', 'name phone department')
    .populate('actions.performedBy', 'name role')
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
    console.error('❌ Error getting driver incidents for super admin:', error);
    next(error);
  }
};

// @desc    Get incidents for department with better filtering
// @route   GET /api/incidents/department/available
// @access  Private (Department/Admin/SuperAdmin)
exports.getDepartmentAvailableIncidents = async (req, res, next) => {
  try {
    const department = req.user.department;
    
    console.log(`🏢 Getting available incidents for department: ${department}`);
    
    if (!department) {
      return res.status(400).json({
        success: false,
        message: 'Department not found for user'
      });
    }

    // Find incidents assigned to this department that are available for driver assignment
    // Show both pending and assigned incidents WITHOUT drivers
    const incidents = await Incident.find({
      'assignedTo.department': department,
      status: { $in: ['approved', 'assigned'] },
      $or: [
        { 'assignedTo.driver': { $exists: false } },
        { 'assignedTo.driver': null }
      ]
    })
    .populate('reportedBy', 'name email phone')
    .populate('actions.performedBy', 'name role')
    .sort('-createdAt');

    console.log(`✅ Found ${incidents.length} incidents available for driver assignment`);

    res.status(200).json({
      success: true,
      count: incidents.length,
      data: incidents
    });
  } catch (error) {
    console.error('❌ Error getting department incidents:', error);
    next(error);
  }
};

// @desc    Get all incidents for department (including those with drivers)
// @route   GET /api/incidents/department/all
// @access  Private (Department/Admin/SuperAdmin)
exports.getAllDepartmentIncidents = async (req, res, next) => {
  try {
    const department = req.user.department;
    
    console.log(`🏢 Getting ALL incidents for department: ${department}`);
    
    if (!department) {
      return res.status(400).json({
        success: false,
        message: 'Department not found for user'
      });
    }

    // Find ALL incidents assigned to this department
    const incidents = await Incident.find({
      'assignedTo.department': department
    })
    .populate('reportedBy', 'name email phone')
    .populate('assignedTo.driver', 'name phone')
    .populate('actions.performedBy', 'name role')
    .sort('-createdAt');

    console.log(`✅ Found ${incidents.length} total incidents for department`);

    // Categorize incidents
    const categorized = {
      available: incidents.filter(inc => !inc.assignedTo?.driver),
      assigned: incidents.filter(inc => inc.assignedTo?.driver),
      byStatus: incidents.reduce((acc, inc) => {
        const status = inc.status || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {})
    };

    res.status(200).json({
      success: true,
      count: incidents.length,
      data: incidents,
      categorized
    });
  } catch (error) {
    console.error('❌ Error getting all department incidents:', error);
    next(error);
  }
};

// @desc    Debug endpoint for department incidents
// @route   GET /api/incidents/debug/department/:departmentName?
// @access  Private (Department/Admin)
exports.debugDepartmentIncidents = async (req, res, next) => {
  try {
    const department = req.params.departmentName || req.user.department;
    
    console.log(`🔍 Debugging incidents for department: ${department}`);
    
    // Get all incidents in the system
    const allIncidents = await Incident.find({})
      .populate('reportedBy', 'name email phone')
      .populate('assignedTo.driver', 'name phone')
      .sort('-createdAt')
      .limit(50);

    console.log(`📊 Total incidents in system: ${allIncidents.length}`);

    // Filter for this department
    const departmentIncidents = allIncidents.filter(inc => 
      inc.assignedTo?.department === department
    );

    // Categorize
    const categorized = {
      all: departmentIncidents,
      withoutDriver: departmentIncidents.filter(inc => !inc.assignedTo?.driver),
      withDriver: departmentIncidents.filter(inc => inc.assignedTo?.driver),
      byStatus: departmentIncidents.reduce((acc, inc) => {
        const status = inc.status || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {})
    };

    res.status(200).json({
      success: true,
      department,
      totalInSystem: allIncidents.length,
      departmentIncidents: departmentIncidents.length,
      categorized,
      incidents: departmentIncidents.map(inc => ({
        id: inc._id,
        status: inc.status,
        assignedTo: inc.assignedTo,
        description: inc.description,
        createdAt: inc.createdAt
      }))
    });
  } catch (error) {
    console.error('❌ Error debugging department incidents:', error);
    next(error);
  }
};

// @desc    Update incident status - ENHANCED HOSPITAL ASSIGNMENT
// @route   PUT /api/incidents/:id/status
// @access  Private
exports.updateIncidentStatus = async (req, res, next) => {
  try {
    const { status, hospital, patientCondition, action } = req.body;
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    console.log('🚑 Status Update:', {
      incidentId: incident._id,
      status: status,
      hospital: hospital,
      patientCondition: patientCondition,
      action: action,
      user: req.user.id
    });

    // ✅ HOSPITAL NAME NORMALIZATION
    let normalizedHospital = hospital;
    if (hospital && hospital === 'Hospital') {
      normalizedHospital = 'Jinnah Hospital';
      console.log(`🏥 Normalized hospital name: "${hospital}" -> "${normalizedHospital}"`);
    }

    const previousStatus = incident.status;
    
    // DRIVER ACTIONS
    if (req.user.role === 'driver') {
      if (action === 'arrived') {
        // Driver marks as arrived at scene
        incident.status = 'in_progress';
        incident.hospitalStatus = 'incoming';
        if (!incident.timestamps) incident.timestamps = {};
        incident.timestamps.hospitalArrivalAt = new Date();
        
        incident.actions.push({
          action: 'driver_arrived_at_scene',
          performedBy: req.user.id,
          timestamp: new Date()
        });

      } else if (action === 'transporting' && normalizedHospital) {
        // Driver starts transport to hospital
        incident.patientStatus = {
          condition: patientCondition || 'Being transported',
          hospital: normalizedHospital,
          updatedAt: new Date()
        };
        incident.hospitalStatus = 'incoming';
        
        incident.actions.push({
          action: 'transporting_to_hospital',
          performedBy: req.user.id,
          details: { hospital: normalizedHospital },
          timestamp: new Date()
        });

      } else if (action === 'completed' && normalizedHospital) {
        // 🚨 CRITICAL FIX: Driver completes delivery to hospital
        incident.status = 'completed';
        incident.driverStatus = 'completed';
        incident.hospitalStatus = 'incoming'; // This is key for hospital dashboard
        
        incident.patientStatus = {
          condition: patientCondition || 'Delivered to hospital',
          hospital: normalizedHospital,
          updatedAt: new Date()
        };

        if (!incident.timestamps) incident.timestamps = {};
        incident.timestamps.completedAt = new Date();
        
        incident.actions.push({
          action: 'delivered_to_hospital',
          performedBy: req.user.id,
          details: { 
            hospital: normalizedHospital,
            condition: patientCondition 
          },
          timestamp: new Date()
        });

        console.log(`🏥 Incident ${incident._id} delivered to hospital: ${normalizedHospital}`);
        console.log(`📊 Hospital status set to: incoming`);
      }
    }
    
    // HOSPITAL ACTIONS
    else if (req.user.role === 'hospital') {
      if (action === 'admit') {
        // Hospital admits the patient
        incident.hospitalStatus = 'admitted';
        if (!incident.timestamps) incident.timestamps = {};
        incident.timestamps.admittedAt = new Date();
        
        incident.patientStatus = {
          ...incident.patientStatus,
          condition: patientCondition || 'Admitted',
          bedNumber: req.body.bedNumber,
          doctor: req.body.doctor,
          updatedAt: new Date()
        };

        incident.actions.push({
          action: 'patient_admitted',
          performedBy: req.user.id,
          details: { 
            bedNumber: req.body.bedNumber,
            doctor: req.body.doctor
          },
          timestamp: new Date()
        });

      } else if (action === 'discharge') {
        // Hospital discharges the patient
        incident.hospitalStatus = 'discharged';
        if (!incident.timestamps) incident.timestamps = {};
        incident.timestamps.dischargedAt = new Date();
        
        incident.patientStatus = {
          ...incident.patientStatus,
          condition: 'Discharged',
          treatment: req.body.treatment,
          medicalNotes: req.body.medicalNotes,
          updatedAt: new Date()
        };

        incident.actions.push({
          action: 'patient_discharged',
          performedBy: req.user.id,
          details: { 
            treatment: req.body.treatment,
            notes: req.body.medicalNotes
          },
          timestamp: new Date()
        });
      }
    }

    await incident.save();
    await incident.populate('reportedBy', 'name email phone');
    await incident.populate('assignedTo.driver', 'name phone');

    console.log(`✅ Incident ${incident._id} updated successfully`);
    console.log(`📊 Final Status:`, {
      status: incident.status,
      hospitalStatus: incident.hospitalStatus,
      patientStatus: incident.patientStatus
    });

    // Emit real-time update
    if (req.io) {
      req.io.emit('incidentUpdated', incident);
    }

    res.status(200).json({
      success: true,
      data: incident
    });
  } catch (error) {
    console.error('❌ Error updating incident status:', error);
    next(error);
  }
};

// @desc    Get nearby incidents
// @route   GET /api/incidents/nearby
// @access  Private
exports.getNearbyIncidents = async (req, res, next) => {
  try {
    const { longitude, latitude, maxDistance = 5000 } = req.query; // maxDistance in meters

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Longitude and latitude are required'
      });
    }

    const incidents = await Incident.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(maxDistance)
        }
      },
      status: { $in: ['approved', 'assigned', 'in_progress'] }
    }).populate('reportedBy', 'name phone')
      .populate('assignedTo.driver', 'name phone');

    res.status(200).json({
      success: true,
      count: incidents.length,
      data: incidents
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get incident statistics
// @route   GET /api/incidents/stats
// @access  Private
exports.getIncidentStats = async (req, res, next) => {
  try {
    let matchQuery = {};

    // Filter based on user role
    if (req.user.role === 'citizen') {
      matchQuery.reportedBy = req.user.id;
    } else if (req.user.role === 'driver') {
      matchQuery['assignedTo.driver'] = req.user.id;
    } else if (req.user.role === 'department') {
      matchQuery['assignedTo.department'] = req.user.department;
    } else if (req.user.role === 'hospital') {
      matchQuery['patientStatus.hospital'] = req.user.hospital;
    }

    const stats = await Incident.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          approved: {
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
          },
          assigned: {
            $sum: { $cond: [{ $eq: ['$status', 'assigned'] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          rejected: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
          }
        }
      }
    ]);

    // Category-wise stats
    const categoryStats = await Incident.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);

    const result = stats[0] || {
      total: 0, pending: 0, approved: 0, assigned: 0, inProgress: 0, completed: 0, rejected: 0
    };

    result.categories = categoryStats;

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete incident
// @route   DELETE /api/incidents/:id
// @access  Private (Admin/SuperAdmin)
exports.deleteIncident = async (req, res, next) => {
  try {
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    await Incident.findByIdAndDelete(req.params.id);

    // Emit real-time update
    if (req.io) {
      req.io.emit('incidentDeleted', { id: req.params.id });
    }

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get incidents for mobile app
// @route   GET /api/incidents/mobile/list
// @access  Private
exports.getMobileIncidents = async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = {};

    // Build query based on user role
    if (req.user.role === 'driver') {
      query = { 'assignedTo.driver': req.user.id };
    } else if (req.user.role === 'department') {
      query = { 'assignedTo.department': req.user.department };
    } else if (req.user.role === 'citizen') {
      query = { reportedBy: req.user.id };
    }

    if (status) {
      query.status = status;
    }

    const incidents = await Incident.find(query)
      .populate('reportedBy', 'name phone')
      .populate('assignedTo.driver', 'name phone')
      .sort('-createdAt')
      .limit(50);

    res.status(200).json({
      success: true,
      data: incidents
    });
  } catch (error) {
    next(error);
  }
};

// Helper functions
function canAccessIncident(user, incident) {
  if (user.role === 'superadmin' || user.role === 'admin') return true;
  if (user.role === 'citizen' && incident.reportedBy._id.toString() === user.id) return true;
  if (user.role === 'driver' && incident.assignedTo.driver?.toString() === user.id) return true;
  if (user.role === 'department' && incident.assignedTo.department === user.department) return true;
  if (user.role === 'hospital' && incident.patientStatus.hospital === user.hospital) return true;
  return false;
}

function canUpdateStatus(user, incident) {
  if (user.role === 'superadmin' || user.role === 'admin') return true;
  if (user.role === 'driver' && incident.assignedTo.driver?.toString() === user.id) return true;
  if (user.role === 'department' && incident.assignedTo.department === user.department) return true;
  return false;
}

function getDefaultPriority(category) {
  const priorityMap = {
    'Medical': 'high',
    'Fire': 'urgent',
    'Accident': 'high',
    'Crime': 'medium',
    'Natural Disaster': 'urgent',
    'Other': 'medium'
  };
  return priorityMap[category] || 'medium';
}