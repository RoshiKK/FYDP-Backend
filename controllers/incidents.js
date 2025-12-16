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
      
      if (req.user.department) {
        baseFilter['assignedTo.department'] = req.user.department;
        // Show incidents that are assigned to department but not yet completed
        baseFilter.status = { $in: ['approved', 'assigned', 'in_progress'] };
      }
    } else if (req.user.role === 'hospital') {
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

// controllers/incidents.js - Update createIncident method
exports.createIncident = async (req, res, next) => {
  try {
    // Add user to req.body
    req.body.reportedBy = req.user.id;

    console.log('📝 Creating incident with data:', {
      reportedBy: req.user.id,
      hasFiles: !!req.files,
      fileCount: req.files?.length || 0
    });

    // Handle file uploads - GridFS files are already processed
    if (req.files && req.files.length > 0) {
      console.log('📸 Processing GridFS uploaded files:', req.files.length);
      
      // DEBUG: Log each file
      req.files.forEach((file, index) => {
        console.log(`📁 File ${index + 1}:`, {
          filename: file.filename,
          originalname: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          id: file.id, // GridFS ID
          metadata: file.metadata
        });
      });
      
      // Store GridFS file information
      req.body.photos = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: new Date(),
        // CRITICAL FIX: Use consistent URL pattern
        url: `/api/upload/image/${file.filename}` // Always use singular "upload"
      }));
    }

    // AI detection simulation
    req.body.aiDetectionScore = Math.floor(Math.random() * 100);

    // Set default category to Accident and high priority
    if (!req.body.category) {
      req.body.category = 'Accident';
    }
    if (!req.body.priority) {
      req.body.priority = 'high';
    }

    // Set default description if empty
    if (!req.body.description || req.body.description.trim() === '') {
      req.body.description = 'Accident reported with photo';
    }

    // ENHANCED LOCATION HANDLING WITH OPENSTREETMAP
    if (req.body.location && typeof req.body.location === 'object') {
      if (req.body.location.coordinates && Array.isArray(req.body.location.coordinates)) {
        req.body.location.type = 'Point';
        
        // Get detailed address from coordinates using OpenStreetMap
        const [longitude, latitude] = req.body.location.coordinates;
        
        console.log(`📍 Getting detailed address for: ${latitude}, ${longitude}`);
        
        // Use the enhanced geocoding service
        const address = await GeocodingService.getAddressFromCoordinates(latitude, longitude);
        
        // Update location with proper detailed address
        req.body.location.address = address;
        console.log(`📍 Location resolved: ${address}`);
        
        // Also store the raw coordinates for backup
        req.body.location.rawCoordinates = {
          latitude: latitude,
          longitude: longitude
        };
      }
    }

    console.log('🚀 Creating incident with final data:', {
      category: req.body.category,
      priority: req.body.priority,
      description: req.body.description,
      photosCount: req.body.photos?.length || 0,
      location: req.body.location
    });

    const incident = await Incident.create(req.body);

    // Add creation action
    incident.actions.push({
      action: 'created',
      performedBy: req.user.id,
      details: { status: 'pending' }
    });
    await incident.save();

    // Populate the response
    await incident.populate('reportedBy', 'name email phone');

    // Send emergency alerts
    await AlertService.sendEmergencyAlerts(incident._id);

    // Emit real-time update
    if (req.io) {
      req.io.emit('newIncident', incident);
    }

    console.log('✅ Incident created with photos:', {
      incidentId: incident._id,
      photoCount: incident.photos?.length || 0,
      photos: incident.photos?.map(p => ({
        filename: p.filename,
        url: p.url
      }))
    });

    res.status(201).json({
      success: true,
      data: incident
    });
  } catch (error) {
    console.error('❌ Error creating incident:', error);
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
exports.approveIncident = async (req, res, next) => {
  try {
    const { department } = req.body; // Get department from request body
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    // Validate department
    const validDepartments = ['Edhi Foundation', 'Chippa Ambulance'];
    if (!department || !validDepartments.includes(department)) {
      return res.status(400).json({
        success: false,
        message: 'Valid department (Edhi Foundation or Chippa Ambulance) is required'
      });
    }

    console.log(`Assigning incident ${incident._id} to ${department}`);

    // Update incident with proper assignment
    incident.status = 'assigned';
    incident.assignedTo = {
      department: department,
      assignedAt: new Date(),
      assignedBy: req.user.id
    };

    // Add action log
    if (!incident.actions) {
      incident.actions = [];
    }
    
    incident.actions.push({
      action: 'approved_and_assigned',
      performedBy: req.user.id,
      details: { 
        reason: req.body.reason || 'Approved by admin',
        department: department
      }
    });

    await incident.save();
    
    // Populate for response
    await incident.populate('reportedBy', 'name email phone');

    console.log(`Incident ${incident._id} approved and assigned to ${department}`);

    // Notify the assigned department
    const departmentUsers = await User.find({
      role: 'department',
      department: department,
      status: 'active'
    });

    for (const user of departmentUsers) {
      await Notification.create({
        recipient: user._id,
        title: 'New Incident Assigned',
        message: `A new ${incident.category} incident has been assigned to your department.`,
        type: 'assignment',
        relatedIncident: incident._id
      });

      console.log(`Notification sent to ${user.email} (${department})`);
    }

    // Emit real-time update
    if (req.io) {
      req.io.emit('incidentApproved', incident);
    }

    res.status(200).json({
      success: true,
      data: incident,
      message: `Incident assigned to ${department}`
    });
  } catch (error) {
    console.error('Error approving incident:', error);
    next(error);
  }
};

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
      req.io.emit('incidentRejected', incident);
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
exports.assignDriver = async (req, res, next) => {
  try {
    const { driverId } = req.body;
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    const driver = await User.findById(driverId);
    if (!driver || driver.role !== 'driver') {
      return res.status(400).json({
        success: false,
        message: 'Invalid driver ID'
      });
    }

    console.log(`🚗 Assigning driver ${driver.name} (${driverId}) to incident ${incident._id}`);

    // ENHANCED: Update incident with proper driver assignment
    incident.assignedTo = {
      department: req.user.department || incident.assignedTo?.department,
      driver: driverId,
      assignedAt: new Date(),
      assignedBy: req.user.id,
      driverName: driver.name
    };
    
    // CRITICAL FIX: Update status to make it visible to driver
    incident.status = 'assigned';
    incident.departmentStatus = 'assigned';

    // Add action log
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

    console.log(`✅ Driver ${driver.name} assigned to incident ${incident._id} successfully`);

    // Notify driver
    await Notification.create({
      recipient: driverId,
      title: 'New Incident Assigned',
      message: `You have been assigned to a new ${incident.category} incident at ${incident.location?.address || incident.location}`,
      type: 'assignment',
      relatedIncident: incident._id
    });

    // Emit real-time update
    if (req.io) {
      req.io.emit('driverAssigned', { incident, driver });
    }

    res.status(200).json({
      success: true,
      data: incident,
      message: `Driver ${driver.name} assigned successfully`
    });
  } catch (error) {
    console.error('❌ Error assigning driver:', error);
    next(error);
  }
};

// @desc    Get incidents for driver - UPDATED VERSION
// @route   GET /api/incidents/driver/my-incidents
// @access  Private (Driver)
exports.getDriverIncidents = async (req, res, next) => {
  try {
    console.log('🚗 Driver incidents request received for driver:', {
      id: req.user.id,
      userId: req.user.userId,
      name: req.user.name,
      role: req.user.role
    });

    // Check if this is a super admin trying to view driver incidents
    const isSuperAdminViewingDriver = req.user.role === 'superadmin' && 
      (req.query.driverId || req.query.viewAsDriver === 'true');

    let driverId;
    
    if (isSuperAdminViewingDriver) {
      // Super admin can view any driver's incidents
      driverId = req.query.driverId || req.user.id;
      console.log(`👑 Super Admin viewing incidents for driver: ${driverId}`);
    } else if (req.user.role === 'driver') {
      // Normal driver can only view their own incidents
      driverId = req.user.id;
    } else {
      return res.status(403).json({
        success: false,
        message: 'Only drivers or super admins can view driver incidents'
      });
    }

    console.log(`🔍 Looking for incidents assigned to driver ID: ${driverId}`);

    // Enhanced query with better ObjectId handling
    const incidents = await Incident.find({
      'assignedTo.driver': driverId,
      status: { $in: ['assigned', 'in_progress', 'completed'] }
    })
    .populate('reportedBy', 'name email phone')
    .populate('assignedTo.driver', 'name phone department')
    .populate('actions.performedBy', 'name role')
    .sort('-createdAt');

    console.log(`✅ Found ${incidents.length} incidents for driver ${driverId}`);
    
    // Debug: Log each incident details
    incidents.forEach(incident => {
      console.log(`📋 Incident ${incident._id}:`, {
        status: incident.status,
        driverStatus: incident.driverStatus,
        assignedDriver: incident.assignedTo?.driver?._id || incident.assignedTo?.driver,
        driverName: incident.assignedTo?.driver?.name,
        department: incident.assignedTo?.department
      });
    });

    res.status(200).json({
      success: true,
      count: incidents.length,
      driverId: driverId,
      isSuperAdmin: req.user.role === 'superadmin',
      data: incidents
    });
  } catch (error) {
    console.error('❌ Error getting driver incidents:', error);
    next(error);
  }
};

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