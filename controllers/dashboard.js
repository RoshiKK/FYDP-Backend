const Incident = require('../models/Incident');
const User = require('../models/User');
const Notification = require('../models/Notification');

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private
exports.getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let stats = {};

    if (userRole === 'superadmin') {
      stats = await getSuperAdminStats();
    } else if (userRole === 'admin') {
      stats = await getAdminStats();
    } else if (userRole === 'department') {
      stats = await getDepartmentStats(req.user.department);
    } else if (userRole === 'driver') {
      stats = await getDriverStats(userId);
    } else if (userRole === 'hospital') {
      stats = await getHospitalStats(req.user.hospital);
    } else if (userRole === 'citizen') {
      stats = await getCitizenStats(userId);
    }

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get admin dashboard data
// @route   GET /api/dashboard/admin
// @access  Private (Admin/SuperAdmin)
exports.getAdminDashboard = async (req, res, next) => {
  try {
    const [
      pendingIncidents,
      recentIncidents,
      userStats,
      categoryStats
    ] = await Promise.all([
      // Pending incidents
      Incident.find({ status: 'pending' })
        .populate('reportedBy', 'name email phone')
        .sort('-createdAt')
        .limit(10),
      
      // Recent incidents
      Incident.find()
        .populate('reportedBy', 'name email phone')
        .sort('-createdAt')
        .limit(5),
      
      // User statistics
      User.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 },
            active: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            }
          }
        }
      ]),
      
      // Category statistics
      Incident.aggregate([
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Total statistics
    const totalStats = await Incident.aggregate([
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
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      }
    ]);

    const stats = totalStats[0] || { total: 0, pending: 0, approved: 0, completed: 0 };

    res.status(200).json({
      success: true,
      data: {
        stats,
        pendingIncidents,
        recentIncidents,
        userStats,
        categoryStats
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get department dashboard data
// @route   GET /api/dashboard/department
// @access  Private (Department)
exports.getDepartmentDashboard = async (req, res, next) => {
  try {
    const department = req.user.department;

    const [
      activeIncidents,
      availableDrivers,
      departmentStats,
      recentAssignments
    ] = await Promise.all([
      // Active incidents for department
      Incident.find({ 
        'assignedTo.department': department,
        status: { $in: ['assigned', 'in_progress'] }
      })
        .populate('reportedBy', 'name phone')
        .populate('assignedTo.driver', 'name phone')
        .sort('-createdAt'),
      
      // Available drivers
      User.find({ 
        role: 'driver',
        department: department,
        status: 'active'
      }).select('name phone currentLocation'),
      
      // Department statistics
      Incident.aggregate([
        { $match: { 'assignedTo.department': department } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Recent assignments
      Incident.find({ 'assignedTo.department': department })
        .populate('assignedTo.driver', 'name')
        .sort('-assignedTo.assignedAt')
        .limit(5)
    ]);

    res.status(200).json({
      success: true,
      data: {
        activeIncidents,
        availableDrivers,
        departmentStats,
        recentAssignments
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get driver dashboard data
// @route   GET /api/dashboard/driver
// @access  Private (Driver)
exports.getDriverDashboard = async (req, res, next) => {
  try {
    const driverId = req.user.id;

    const [
      assignedIncidents,
      completedIncidents,
      driverStats
    ] = await Promise.all([
      // Assigned incidents
      Incident.find({ 
        'assignedTo.driver': driverId,
        status: { $in: ['assigned', 'in_progress'] }
      })
        .populate('reportedBy', 'name phone')
        .sort('-createdAt'),
      
      // Completed incidents
      Incident.find({ 
        'assignedTo.driver': driverId,
        status: 'completed'
      })
        .sort('-createdAt')
        .limit(10),
      
      // Driver statistics
      Incident.aggregate([
        { $match: { 'assignedTo.driver': new require('mongoose').Types.ObjectId(driverId) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Calculate today's completed incidents
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayCompleted = await Incident.countDocuments({
      'assignedTo.driver': driverId,
      status: 'completed',
      updatedAt: { $gte: today }
    });

    res.status(200).json({
      success: true,
      data: {
        assignedIncidents,
        completedIncidents,
        driverStats,
        todayCompleted
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get hospital dashboard data - FIXED
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

    const [
      incomingCases,
      receivedCases,
      hospitalStats
    ] = await Promise.all([
      // Incoming cases - incidents completed and assigned to this hospital
      Incident.countDocuments({
        'patientStatus.hospital': hospital,
        status: 'completed'  // Changed from in_progress to completed
      }),
      
      // Received cases (historical)
      Incident.countDocuments({
        'patientStatus.hospital': hospital
      }),
      
      // Hospital statistics
      Incident.aggregate([
        { $match: { 'patientStatus.hospital': hospital } },
        {
          $group: {
            _id: '$patientStatus.condition',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Get detailed incoming cases for the list
    const incomingIncidents = await Incident.find({
      'patientStatus.hospital': hospital,
      status: 'completed'  // Show completed incidents in hospital queue
    })
    .populate('reportedBy', 'name phone')
    .populate('assignedTo.driver', 'name phone')
    .sort('-createdAt')
    .limit(10);

    res.status(200).json({
      success: true,
      data: {
        incomingCases,
        receivedCases,
        hospitalStats,
        incomingIncidents,  // Add this to show the actual incidents
        hospitalName: hospital
      }
    });
  } catch (error) {
    next(error);
  }
};

// Helper functions for dashboard statistics
async function getSuperAdminStats() {
  const [
    totalUsers,
    totalIncidents,
    totalDepartments,
    activeIncidents
  ] = await Promise.all([
    User.countDocuments(),
    Incident.countDocuments(),
    User.distinct('department').then(depts => depts.filter(Boolean).length),
    Incident.countDocuments({ status: { $in: ['pending', 'assigned', 'in_progress'] } })
  ]);

  return {
    totalUsers,
    totalIncidents,
    totalDepartments,
    activeIncidents,
    systemUptime: '99.8%',
    activeUsers: await User.countDocuments({ status: 'active' })
  };
}

async function getAdminStats() {
  const [
    pendingApprovals,
    totalIncidents,
    resolvedIncidents,
    duplicateIncidents
  ] = await Promise.all([
    Incident.countDocuments({ status: 'pending' }),
    Incident.countDocuments(),
    Incident.countDocuments({ status: 'completed' }),
    Incident.countDocuments({ duplicateIncidents: { $exists: true, $ne: [] } })
  ]);

  return {
    pendingApprovals,
    totalIncidents,
    resolvedIncidents,
    duplicateIncidents,
    avgResponseTime: '12 mins'
  };
}

async function getDepartmentStats(department) {
  const [
    activeIncidents,
    availableDrivers,
    completedToday,
    totalAssigned
  ] = await Promise.all([
    // FIXED: Only show incidents that are NOT completed for department
    Incident.countDocuments({ 
      'assignedTo.department': department,
      departmentStatus: { $in: ['pending', 'assigned', 'in_progress'] }
    }),
    User.countDocuments({ 
      role: 'driver', 
      department: department,
      status: 'active'
    }),
    Incident.countDocuments({
      'assignedTo.department': department,
      departmentStatus: 'completed',
      updatedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    }),
    Incident.countDocuments({ 'assignedTo.department': department })
  ]);

  return {
    activeIncidents,
    availableDrivers,
    completedToday,
    totalAssigned,
    successRate: totalAssigned > 0 ? Math.round((completedToday / totalAssigned) * 100) : 0
  };
}

async function getDriverStats(driverId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    completedToday,
    totalCompleted,
    activeAssignments,
    totalDistance
  ] = await Promise.all([
    Incident.countDocuments({
      'assignedTo.driver': driverId,
      status: 'completed',
      updatedAt: { $gte: today }
    }),
    Incident.countDocuments({ 
      'assignedTo.driver': driverId,
      status: 'completed'
    }),
    Incident.countDocuments({
      'assignedTo.driver': driverId,
      status: { $in: ['assigned', 'in_progress'] }
    }),
    // This would normally come from a separate tracking system
    0
  ]);

  return {
    completedToday,
    totalCompleted,
    activeAssignments,
    totalDistance: `${totalDistance} km`,
    avgResponseTime: '8 mins',
    successRate: '96%'
  };
}

async function getHospitalStats(hospital) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    incomingCases,
    todayAdmissions,
    totalCases,
    emergencyCases
  ] = await Promise.all([
    // FIXED: Only show incidents that are assigned to this hospital and not completed
    Incident.countDocuments({
      'patientStatus.hospital': hospital,
      hospitalStatus: { $in: ['pending', 'admitted'] }
    }),
    Incident.countDocuments({
      'patientStatus.hospital': hospital,
      hospitalStatus: 'admitted',
      'timestamps.hospitalArrivalAt': { $gte: today }
    }),
    Incident.countDocuments({ 'patientStatus.hospital': hospital }),
    Incident.countDocuments({
      'patientStatus.hospital': hospital,
      priority: 'urgent',
      hospitalStatus: { $in: ['pending', 'admitted'] }
    })
  ]);

  return {
    incomingCases,
    todayAdmissions,
    totalCases,
    emergencyCases,
    avgAmbulanceTime: '18 mins'
  };
}

async function getCitizenStats(userId) {
  const [
    totalReports,
    pendingReports,
    resolvedReports,
    rejectedReports
  ] = await Promise.all([
    Incident.countDocuments({ reportedBy: userId }),
    Incident.countDocuments({ reportedBy: userId, status: 'pending' }),
    Incident.countDocuments({ reportedBy: userId, status: 'completed' }),
    Incident.countDocuments({ reportedBy: userId, status: 'rejected' })
  ]);

  return {
    totalReports,
    pendingReports,
    resolvedReports,
    rejectedReports
  };
}