const User = require('../models/User');



// @desc    Get all users
// @route   GET /api/users
// @access  Private (Admin/SuperAdmin)
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-password').sort('-createdAt');

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get drivers by department (FOR DEPARTMENT USERS)
// @route   GET /api/users/department/drivers
// @access  Private (Department)
exports.getDriversForDepartment = async (req, res, next) => {
  try {
    const department = req.user.department;
    
    if (!department) {
      return res.status(400).json({
        success: false,
        message: 'Department not found for user'
      });
    }

    console.log(`🏢 Department user ${req.user.email} getting drivers for: ${department}`);

    // Normalize department name
    let normalizedDepartment = department;
    if (department.includes('Edhi') || department.includes('edhi')) {
      normalizedDepartment = 'Edhi Foundation';
    } else if (department.includes('Chippa') || department.includes('chippa')) {
      normalizedDepartment = 'Chippa Ambulance';
    }

    // Find drivers by department
    const drivers = await User.find({ 
      role: 'driver',
      department: normalizedDepartment,
      status: 'active'
    }).select('-password');

    console.log(`✅ Found ${drivers.length} drivers for "${normalizedDepartment}"`);

    res.status(200).json({
      success: true,
      count: drivers.length,
      department: normalizedDepartment,
      data: drivers.map(driver => ({
        id: driver._id,
        _id: driver._id,
        userId: driver._id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        role: driver.role,
        department: driver.department,
        ambulanceService: driver.ambulanceService,
        drivingLicense: driver.drivingLicense,
        status: driver.status,
        location: driver.location,
        completedToday: Math.floor(Math.random() * 8), // Mock data
        currentLocation: driver.location ? 
          `${driver.location.coordinates?.[0]?.toFixed(4) || '0'}, ${driver.location.coordinates?.[1]?.toFixed(4) || '0'}` : 
          'Unknown location'
      }))
    });
  } catch (error) {
    console.error('❌ Error getting drivers for department:', error);
    next(error);
  }
};
// @desc    Get drivers by department
// @route   GET /api/users/drivers/:department
// @access  Private (Department/Admin/SuperAdmin)
exports.getDriversByDepartment = async (req, res, next) => {
  try {
    const { department } = req.params;
    const userRole = req.user.role;
    const userDepartment = req.user.department;

    console.log(`🚗 Getting drivers for department: "${department}"`);
    console.log(`👤 User role: ${userRole}, User department: "${userDepartment}"`);

    // Authorization check
    if (userRole === 'department') {
      if (userDepartment !== department) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access drivers from this department'
        });
      }
    } else if (userRole !== 'admin' && userRole !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access drivers'
      });
    }

    // Normalize department name
    let normalizedDepartment = department;
    if (department.includes('Edhi') || department.includes('edhi')) {
      normalizedDepartment = 'Edhi Foundation';
    } else if (department.includes('Chippa') || department.includes('chippa')) {
      normalizedDepartment = 'Chippa Ambulance';
    }

    // Find drivers by department
    const drivers = await User.find({ 
      role: 'driver',
      department: normalizedDepartment,
      status: 'active'
    }).select('-password');

    console.log(`✅ Found ${drivers.length} drivers for "${normalizedDepartment}"`);

    res.status(200).json({
      success: true,
      count: drivers.length,
      department: normalizedDepartment,
      data: drivers.map(driver => ({
        id: driver._id,
        _id: driver._id,
        userId: driver._id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        role: driver.role,
        department: driver.department,
        ambulanceService: driver.ambulanceService,
        drivingLicense: driver.drivingLicense,
        status: driver.status,
        location: driver.location,
        completedToday: Math.floor(Math.random() * 8), // Mock data for now
        currentLocation: driver.location ? 
          `${driver.location.coordinates?.[0]?.toFixed(4) || '0'}, ${driver.location.coordinates?.[1]?.toFixed(4) || '0'}` : 
          'Unknown location'
      }))
    });
  } catch (error) {
    console.error('❌ Error getting drivers by department:', error);
    next(error);
  }
};
// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private (Admin/SuperAdmin)
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create user
// @route   POST /api/users
// @access  Private (Admin/SuperAdmin)
exports.createUser = async (req, res, next) => {
  try {
    const user = await User.create(req.body);

    res.status(201).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (Admin/SuperAdmin)
exports.updateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Admin/SuperAdmin)
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting superadmin
    if (user.role === 'superadmin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete super admin user'
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Restrict user
// @route   PUT /api/users/:id/restrict
// @access  Private (Admin/SuperAdmin)
exports.restrictUser = async (req, res, next) => {
  try {
    const { restrictionDays, reason } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let restrictionEndDate = null;
    if (restrictionDays > 0) {
      restrictionEndDate = new Date();
      restrictionEndDate.setDate(restrictionEndDate.getDate() + restrictionDays);
    }

    user.status = restrictionDays > 0 ? 'suspended' : 'active';
    user.restrictionEndDate = restrictionEndDate;

    await user.save();

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private (Admin/SuperAdmin)
exports.getUserStats = async (req, res, next) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          suspended: {
            $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] }
          }
        }
      }
    ]);

    const totalStats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeUsers: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          suspendedUsers: {
            $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] }
          }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        byRole: stats,
        total: totalStats[0] || { totalUsers: 0, activeUsers: 0, suspendedUsers: 0 }
      }
    });
  } catch (error) {
    next(error);
  }
};