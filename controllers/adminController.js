// controllers/adminController.js

const Incident = require('../models/Incident');
const User = require('../models/User');
const Notification = require('../models/Notification');

// @desc    Get admin dashboard data
// @route   GET /api/admin/dashboard
// @access  Private (Admin/SuperAdmin)
exports.getAdminDashboard = async (req, res, next) => {
  try {
    const [
      totalIncidents,
      pendingIncidents,
      approvedIncidents,
      completedIncidents,
      recentIncidents,
      userStats,
      categoryStats,
      departmentStats
    ] = await Promise.all([
      // Total incidents
      Incident.countDocuments(),
      
      // Pending incidents
      Incident.countDocuments({ status: 'pending' }),
      
      // Approved incidents
      Incident.countDocuments({ status: 'approved' }),
      
      // Completed incidents
      Incident.countDocuments({ status: 'completed' }),
      
      // Recent incidents (last 10)
      Incident.find()
        .populate('reportedBy', 'name email phone')
        .sort('-createdAt')
        .limit(10),
      
      // User statistics by role
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
      ]),
      
      // Department statistics
      Incident.aggregate([
        { $match: { assignedTo: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: '$assignedTo.department',
            count: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            }
          }
        }
      ])
    ]);

    // Calculate response time statistics
    const responseTimeStats = await Incident.aggregate([
      { $match: { status: 'completed' } },
      {
        $project: {
          responseTime: {
            $divide: [
              { $subtract: ['$updatedAt', '$createdAt'] },
              60000 // Convert to minutes
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgResponseTime: { $avg: '$responseTime' },
          minResponseTime: { $min: '$responseTime' },
          maxResponseTime: { $max: '$responseTime' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalIncidents,
          pendingIncidents,
          approvedIncidents,
          completedIncidents,
          avgResponseTime: responseTimeStats[0]?.avgResponseTime || 0
        },
        recentIncidents,
        userStats,
        categoryStats,
        departmentStats,
        analytics: {
          dailyIncidents: await getDailyIncidents(),
          monthlyTrends: await getMonthlyTrends(),
          priorityDistribution: await getPriorityDistribution()
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get incidents for admin with filters
// @route   GET /api/admin/incidents
// @access  Private (Admin/SuperAdmin)
exports.getAdminIncidents = async (req, res, next) => {
  try {
    const {
      status,
      priority,
      category,
      department,
      page = 1,
      limit = 10,
      sort = '-createdAt',
      search
    } = req.query;

    let query = {};

    // Apply filters
    if (status && status !== 'all') query.status = status;
    if (priority) query.priority = priority;
    if (category) query.category = category;
    if (department) query['assignedTo.department'] = department;
    
    // Search functionality
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { 'reportedBy.name': { $regex: search, $options: 'i' } },
        { 'assignedTo.department': { $regex: search, $options: 'i' } }
      ];
    }

    const incidents = await Incident.find(query)
      .populate('reportedBy', 'name email phone')
      .populate('assignedTo.driver', 'name phone')
      .populate('actions.performedBy', 'name role')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Incident.countDocuments(query);

    res.status(200).json({
      success: true,
      count: incidents.length,
      total,
      pagination: {
        page: Number(page),
        pages: Math.ceil(total / limit)
      },
      data: incidents
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk actions for incidents
// @route   POST /api/admin/incidents/bulk-actions
// @access  Private (Admin/SuperAdmin)
exports.bulkIncidentActions = async (req, res, next) => {
  try {
    const { incidentIds, action, reason, department } = req.body;

    if (!incidentIds || !Array.isArray(incidentIds) || incidentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Incident IDs are required'
      });
    }

    let updateData = {};
    let actionType = '';

    switch (action) {
      case 'approve':
        // Validate department for approval
        const validDepartments = ['Edhi Foundation', 'Chippa Ambulance'];
        if (!department || !validDepartments.includes(department)) {
          return res.status(400).json({
            success: false,
            message: 'Valid department (Edhi Foundation or Chippa Ambulance) is required for approval'
          });
        }
        updateData = { 
          status: 'assigned',
          'assignedTo.department': department,
          'assignedTo.assignedAt': new Date(),
          'assignedTo.assignedBy': req.user.id
        };
        actionType = 'approved_and_assigned';
        break;
      case 'reject':
        updateData = { status: 'rejected' };
        actionType = 'rejected';
        break;
      case 'assign_department':
        if (!department) {
          return res.status(400).json({
            success: false,
            message: 'Department is required for assignment'
          });
        }
        updateData = {
          'assignedTo.department': department,
          status: 'assigned'
        };
        actionType = 'department_assigned';
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid action'
        });
    }

    // Update incidents
    const result = await Incident.updateMany(
      { _id: { $in: incidentIds } },
      { $set: updateData }
    );

    // Add action logs
    for (const incidentId of incidentIds) {
      const incident = await Incident.findById(incidentId);
      if (incident) {
        incident.actions.push({
          action: actionType,
          performedBy: req.user.id,
          details: { reason, department }
        });
        await incident.save();
      }
    }

    res.status(200).json({
      success: true,
      message: `Successfully ${action} ${result.modifiedCount} incidents`,
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get system analytics
// @route   GET /api/admin/analytics
// @access  Private (Admin/SuperAdmin)
exports.getSystemAnalytics = async (req, res, next) => {
  try {
    const { period = '30d' } = req.query; // 7d, 30d, 90d, 1y
    
    const dateRange = getDateRange(period);
    
    const [
      incidentTrends,
      userGrowth,
      departmentPerformance,
      responseTimeAnalysis
    ] = await Promise.all([
      // Incident trends
      getIncidentTrends(dateRange),
      // User growth
      getUserGrowth(dateRange),
      // Department performance
      getDepartmentPerformance(dateRange),
      // Response time analysis
      getResponseTimeAnalysis(dateRange)
    ]);

    res.status(200).json({
      success: true,
      data: {
        incidentTrends,
        userGrowth,
        departmentPerformance,
        responseTimeAnalysis,
        period
      }
    });
  } catch (error) {
    next(error);
  }
};

// Helper functions
async function getDailyIncidents() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return await Incident.aggregate([
    {
      $match: {
        createdAt: { $gte: today }
      }
    },
    {
      $group: {
        _id: {
          hour: { $hour: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.hour': 1 }
    }
  ]);
}

async function getMonthlyTrends() {
  return await Incident.aggregate([
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 }
    },
    {
      $limit: 12
    }
  ]);
}

async function getPriorityDistribution() {
  return await Incident.aggregate([
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 }
      }
    }
  ]);
}

function getDateRange(period) {
  const now = new Date();
  const from = new Date();
  
  switch (period) {
    case '7d':
      from.setDate(now.getDate() - 7);
      break;
    case '30d':
      from.setDate(now.getDate() - 30);
      break;
    case '90d':
      from.setDate(now.getDate() - 90);
      break;
    case '1y':
      from.setFullYear(now.getFullYear() - 1);
      break;
    default:
      from.setDate(now.getDate() - 30);
  }
  
  return { from, to: now };
}

async function getIncidentTrends(dateRange) {
  return await Incident.aggregate([
    {
      $match: {
        createdAt: { $gte: dateRange.from, $lte: dateRange.to }
      }
    },
    {
      $group: {
        _id: {
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          }
        },
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        }
      }
    },
    {
      $sort: { '_id.date': 1 }
    }
  ]);
}

async function getUserGrowth(dateRange) {
  return await User.aggregate([
    {
      $match: {
        createdAt: { $gte: dateRange.from, $lte: dateRange.to }
      }
    },
    {
      $group: {
        _id: {
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          }
        },
        newUsers: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.date': 1 }
    }
  ]);
}

async function getDepartmentPerformance(dateRange) {
  return await Incident.aggregate([
    {
      $match: {
        createdAt: { $gte: dateRange.from, $lte: dateRange.to },
        'assignedTo.department': { $exists: true }
      }
    },
    {
      $group: {
        _id: '$assignedTo.department',
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        avgResponseTime: {
          $avg: {
            $divide: [
              { $subtract: ['$updatedAt', '$createdAt'] },
              60000
            ]
          }
        }
      }
    }
  ]);
}

async function getResponseTimeAnalysis(dateRange) {
  return await Incident.aggregate([
    {
      $match: {
        createdAt: { $gte: dateRange.from, $lte: dateRange.to },
        status: 'completed'
      }
    },
    {
      $project: {
        responseTime: {
          $divide: [
            { $subtract: ['$updatedAt', '$createdAt'] },
            60000
          ]
        },
        category: 1,
        priority: 1
      }
    },
    {
      $group: {
        _id: null,
        overallAvg: { $avg: '$responseTime' },
        byCategory: {
          $push: {
            category: '$category',
            avgResponseTime: '$responseTime'
          }
        },
        byPriority: {
          $push: {
            priority: '$priority',
            avgResponseTime: '$responseTime'
          }
        }
      }
    }
  ]);
}