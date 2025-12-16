const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const Notification = require('../models/Notification');
const jwt = require('jsonwebtoken');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, phone, cnic, password, role, department, hospital, ambulanceService, drivingLicense } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { cnic }, { phone }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email, CNIC or phone already exists'
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      phone,
      cnic,
      password,
      role: role || 'citizen',
      department,
      hospital,
      ambulanceService,
      drivingLicense,
      status: 'active'
    });

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Send welcome notification
    await Notification.create({
      recipient: user._id,
      title: 'Welcome to Incident Reporting System',
      message: `Welcome ${name}! Your account has been created successfully as ${role}.`,
      type: 'system'
    });

    sendTokenResponse(user, 201, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Impersonate user (Super Admin only)
// @route   POST /api/auth/impersonate/:userId
// @access  Private (SuperAdmin only)
exports.impersonateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Only super admin can impersonate
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only super admin can impersonate users'
      });
    }

    // Find the user to impersonate
    const userToImpersonate = await User.findById(userId).select('-password');
    
    if (!userToImpersonate) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👑 Super Admin ${req.user.email} impersonating ${userToImpersonate.email} (${userToImpersonate.role})`);

    // Create a special impersonation token
    const impersonationToken = jwt.sign(
      { 
        id: userToImpersonate._id,
        userId: userToImpersonate._id.toString(),
        _id: userToImpersonate._id.toString(),
        email: userToImpersonate.email,
        role: userToImpersonate.role,
        name: userToImpersonate.name,
        department: userToImpersonate.department,
        hospital: userToImpersonate.hospital,
        ambulanceService: userToImpersonate.ambulanceService,
        drivingLicense: userToImpersonate.drivingLicense,
        phone: userToImpersonate.phone,
        cnic: userToImpersonate.cnic,
        impersonatedBy: req.user.id, // Track who is impersonating
        isImpersonation: true,
        originalUser: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role
        }
      }, 
      process.env.JWT_SECRET, 
      {
        expiresIn: '1h', // Short expiration for impersonation
      }
    );

    // Enhanced user response
    const userResponse = {
      id: userToImpersonate._id,
      _id: userToImpersonate._id,
      userId: userToImpersonate._id.toString(),
      name: userToImpersonate.name,
      email: userToImpersonate.email,
      role: userToImpersonate.role,
      phone: userToImpersonate.phone,
      cnic: userToImpersonate.cnic,
      department: userToImpersonate.department,
      hospital: userToImpersonate.hospital,
      ambulanceService: userToImpersonate.ambulanceService,
      drivingLicense: userToImpersonate.drivingLicense,
      status: userToImpersonate.status,
      lastLogin: userToImpersonate.lastLogin,
      createdAt: userToImpersonate.createdAt,
      updatedAt: userToImpersonate.updatedAt,
      isImpersonation: true,
      originalUser: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      }
    };

    // Log the impersonation
    await Notification.create({
      recipient: userToImpersonate._id,
      title: 'Account Accessed by Super Admin',
      message: `Your account was accessed by Super Admin ${req.user.name} for administrative purposes.`,
      type: 'system',
      read: false
    });

    res.status(200).json({
      success: true,
      token: impersonationToken,
      user: userResponse,
      message: `Now viewing as ${userToImpersonate.name} (${userToImpersonate.role})`
    });
  } catch (error) {
    console.error('❌ Error impersonating user:', error);
    next(error);
  }
};

// @desc    Return to Super Admin from impersonation - DEBUG VERSION
// @route   POST /api/auth/return-to-admin
// @access  Private (Impersonated users only)
exports.returnToAdmin = async (req, res, next) => {
  try {
    console.log('=== RETURN TO ADMIN DEBUG ===');
    console.log('🔙 Called by:', req.user.email, 'Role:', req.user.role);
    console.log('🔑 Is impersonation:', req.user.isImpersonation);
    console.log('👑 Impersonated by:', req.user.impersonatedBy);
    
    // Check if this is an impersonated session
    if (!req.user.isImpersonation || !req.user.impersonatedBy) {
      console.log('❌ Not in impersonation mode');
      return res.status(400).json({
        success: false,
        message: 'Not in impersonation mode'
      });
    }

    // Find the original super admin
    const originalAdmin = await User.findById(req.user.impersonatedBy).select('-password');
    
    if (!originalAdmin) {
      console.log('❌ Original admin not found');
      return res.status(404).json({
        success: false,
        message: 'Original admin not found'
      });
    }

    console.log('✅ Found original admin:', {
      email: originalAdmin.email,
      role: originalAdmin.role,
      status: originalAdmin.status
    });

    // Create a proper superadmin token
    const tokenPayload = {
      id: originalAdmin._id.toString(),
      userId: originalAdmin._id.toString(),
      _id: originalAdmin._id.toString(),
      email: originalAdmin.email,
      role: 'superadmin', // Force superadmin role
      name: originalAdmin.name,
      department: originalAdmin.department,
      hospital: originalAdmin.hospital,
      ambulanceService: originalAdmin.ambulanceService,
      drivingLicense: originalAdmin.drivingLicense,
      phone: originalAdmin.phone,
      cnic: originalAdmin.cnic,
      status: originalAdmin.status,
      // Clear impersonation flags
      isImpersonation: false
    };

    console.log('🔑 Token payload:', tokenPayload);
    
    const token = jwt.sign(
      tokenPayload, 
      process.env.JWT_SECRET, 
      {
        expiresIn: process.env.JWT_EXPIRE || '30d',
      }
    );

    console.log('✅ Token generated (first 20 chars):', token.substring(0, 20) + '...');

    const userResponse = {
      ...tokenPayload,
      lastLogin: originalAdmin.lastLogin,
      createdAt: originalAdmin.createdAt,
      updatedAt: originalAdmin.updatedAt
    };

    console.log('✅ User response ready');
    console.log('=======================');

    res.status(200).json({
      success: true,
      token: token,
      user: userResponse,
      message: 'Returned to Super Admin dashboard',
      redirectTo: '/superadmin?return-to-admin=true',
      debug: {
        tokenLength: token.length,
        userRole: userResponse.role
      }
    });
    
  } catch (error) {
    console.error('❌ Error returning to admin:', error);
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    console.log(`🔐 Login attempt for: ${email}`);

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password'
      });
    }

    // Check for user (include password for verification)
    const user = await User.findOne({ 
      email: email.toLowerCase().trim() 
    }).select('+password');
    
    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log(`✅ User found: ${user.email}`);
    console.log(`🔑 Password field exists: ${!!user.password}`);
    console.log(`👤 User status: ${user.status}`);
    console.log(`🎭 User role: ${user.role}`);
    console.log(`🏢 User department: ${user.department}`);

    // Use the corrected password method
    const isPasswordValid = await user.correctPassword(password);
    console.log(`🔑 Password valid: ${isPasswordValid}`);

    if (!isPasswordValid) {
      console.log('❌ Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      console.log(`❌ User not active: ${user.status}`);
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact administrator.'
      });
    }

    // Check if user is restricted
    if (user.restrictionEndDate && user.restrictionEndDate > new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been restricted. Please contact administrator.'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    console.log(`✅ Login successful for: ${email}`);
    console.log(`🏢 Final department for ${email}: ${user.department}`);

    // Enhanced user response with all department info
    const userResponse = {
      id: user._id,
      _id: user._id,
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      cnic: user.cnic,
      department: user.department,
      hospital: user.hospital,
      ambulanceService: user.ambulanceService,
      drivingLicense: user.drivingLicense,
      status: user.status,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    console.log(`📤 Sending user response:`, {
      email: userResponse.email,
      department: userResponse.department,
      role: userResponse.role
    });

    // Create token with enhanced payload
    const token = jwt.sign(
      { 
        id: user._id,
        userId: user._id.toString(),
        _id: user._id.toString(),
        email: user.email,
        role: user.role,
        name: user.name,
        department: user.department,
        hospital: user.hospital,
        ambulanceService: user.ambulanceService,
        drivingLicense: user.drivingLicense,
        phone: user.phone,
        cnic: user.cnic
      }, 
      process.env.JWT_SECRET, 
      {
        expiresIn: process.env.JWT_EXPIRE,
      }
    );

    const options = {
      expires: new Date(
        Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
      ),
      httpOnly: true
    };

    if (process.env.NODE_ENV === 'production') {
      options.secure = true;
    }

    res
      .status(200)
      .cookie('token', token, options)
      .json({
        success: true,
        token,
        user: userResponse,
        message: `Logged in as ${user.name} (${user.role})`
      });
  } catch (error) {
    console.error('💥 Login error:', error);
    next(error);
  }
};

// @desc    Mobile app login
// @route   POST /api/auth/mobile/login
// @access  Public
exports.mobileLogin = async (req, res, next) => {
  try {
    const { email, password, fcmToken } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email and password'
      });
    }

    // Check for user (include password for verification)
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.correctPassword(password, user.password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact administrator.'
      });
    }

    // Check if user is restricted
    if (user.restrictionEndDate && user.restrictionEndDate > new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been restricted. Please contact administrator.'
      });
    }

    // Update last login and FCM token
    user.lastLogin = new Date();
    if (fcmToken) {
      user.fcmToken = fcmToken;
    }
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user details
// @route   PUT /api/auth/updatedetails
// @access  Private
exports.updateDetails = async (req, res, next) => {
  try {
    const fieldsToUpdate = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone
    };

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update password
// @route   PUT /api/auth/updatepassword
// @access  Private
exports.updatePassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    if (!(await user.correctPassword(req.body.currentPassword, user.password))) {
      return res.status(401).json({
        success: false,
        message: 'Password is incorrect'
      });
    }

    user.password = req.body.newPassword;
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Log user out / clear cookie
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    // Clear FCM token
    await User.findByIdAndUpdate(req.user.id, { 
      $unset: { fcmToken: 1 } 
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get accessible dashboards for user
// @route   GET /api/auth/dashboards
// @access  Private
exports.getAccessibleDashboards = async (req, res, next) => {
  try {
    const user = req.user;
    const accessibleDashboards = [];

    if (user.role === 'superadmin') {
      accessibleDashboards.push('superadmin', 'admin', 'department', 'driver', 'hospital');
    } else if (user.role === 'admin') {
      accessibleDashboards.push('admin');
    } else if (user.role === 'department') {
      accessibleDashboards.push('department');
    } else if (user.role === 'driver') {
      accessibleDashboards.push('driver');
    } else if (user.role === 'hospital') {
      accessibleDashboards.push('hospital');
    } else if (user.role === 'citizen') {
      accessibleDashboards.push('citizen');
    }

    res.status(200).json({
      success: true,
      data: accessibleDashboards
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify token
// @route   GET /api/auth/verify
// @access  Private
exports.verifyToken = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.status(200).json({
      success: true,
      data: {
        valid: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Test endpoint for mobile app
// @route   GET /api/auth/mobile/test
// @access  Public
exports.mobileTest = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Mobile auth API is working!',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

// Helper function to get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  // Create token with enhanced payload
  const token = jwt.sign(
    { 
      id: user._id,
      userId: user._id.toString(),
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
      department: user.department,
      hospital: user.hospital,
      ambulanceService: user.ambulanceService,
      drivingLicense: user.drivingLicense,
      phone: user.phone,
      cnic: user.cnic
    }, 
    process.env.JWT_SECRET, 
    {
      expiresIn: process.env.JWT_EXPIRE,
    }
  );

  const options = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ),
    httpOnly: true
  };

  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }

  // Enhanced user response
  const userResponse = {
    id: user._id,
    _id: user._id,
    userId: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    cnic: user.cnic,
    department: user.department,
    hospital: user.hospital,
    ambulanceService: user.ambulanceService,
    drivingLicense: user.drivingLicense,
    status: user.status,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };

  res
    .status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      token,
      user: userResponse
    });
};