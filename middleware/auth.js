const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      console.log('❌ No token provided in protect middleware');
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      console.log('🔐 JWT Decoded - Role:', decoded.role, 'ID:', decoded.id);
      
      // Enhanced ID extraction
      const userId = decoded.id || decoded.userId || decoded._id || decoded.sub;
      
      if (!userId) {
        console.log('❌ No user ID found in token payload');
        return res.status(401).json({
          success: false,
          message: 'Invalid token format'
        });
      }

      // Find user
      const user = await User.findById(userId).select('-password');
      
      if (!user) {
        console.log('❌ User not found for ID:', userId);
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      if (user.status !== 'active') {
        console.log('❌ User not active:', user.status);
        return res.status(401).json({
          success: false,
          message: 'Your account has been deactivated'
        });
      }

      // Set req.user with complete data
      req.user = {
        id: user._id.toString(),
        _id: user._id,
        userId: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        hospital: user.hospital,
        ambulanceService: user.ambulanceService,
        isImpersonation: decoded.isImpersonation || false,
        impersonatedBy: decoded.impersonatedBy
      };
      
      console.log('✅ User authenticated:', req.user.email, 'Role:', req.user.role);
      
      next();
    } catch (error) {
      console.error('❌ JWT verification error:', error.name, error.message);
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired. Please login again.'
        });
      }
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token. Please login again.'
        });
      }
      
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }
  } catch (error) {
    next(error);
  }
};

exports.authorize = (...roles) => {
  return (req, res, next) => {
    // Allow superadmin to access all endpoints
    if (req.user.role === 'superadmin') {
      return next();
    }
    
    // Special handling for department users
    if (req.user.role === 'department') {
      // Allow department users to access user-related endpoints for their department
      if (req.originalUrl.includes('/api/users/department/drivers') || 
          req.originalUrl.includes('/api/users/drivers/')) {
        return next();
      }
      
      // Allow department users to see users from their department
      if (req.originalUrl === '/api/users' || req.originalUrl.startsWith('/api/users/')) {
        // Check if they're trying to access users from their own department
        return next(); // We'll filter in the controller
      }
    }
    
    // For other roles, use the original logic
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    
    next();
  };
};

// ENHANCED: Better token generation with complete user data
exports.generateToken = (user) => {
  return jwt.sign({ 
    id: user._id,
    userId: user._id.toString(),
    _id: user._id.toString(),
    email: user.email,
    role: user.role,
    name: user.name,
    department: user.department,
    hospital: user.hospital
  }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};