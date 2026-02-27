const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./auth');
const incidentRoutes = require('./incidents');
const userRoutes = require('./users');
const notificationRoutes = require('./notifications');
const dashboardRoutes = require('./dashboard');
const uploadRoutes = require('./upload');
const dummyDriverRoutes = require('./dummyDrivers');

// Health & Info Routes
router.get('/health', (req, res) => {
  const { getAllIPs } = require('../utils/helpers');
  const ips = getAllIPs();
  
  res.json({
    success: true,
    message: '🚀 Server is running perfectly!',
    timestamp: new Date().toISOString(),
    network: {
      availableOn: ips.map(ip => `http://${ip.address}:${process.env.PORT || 5000}`),
      allIPs: ips
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

router.post('/hard-reset', async (req, res) => {
  try {
    const User = require('../models/User');
    
    console.log('🔥 HARD RESET: Deleting all users and recreating ambulance-only system...');
    
    // Delete all existing users
    const deleteResult = await User.deleteMany({});
    console.log('✅ All users deleted:', deleteResult.deletedCount);
    
    // Recreate default users with ambulance-only structure
    const defaultUsers = [
      {
        name: 'Super Admin',
        email: 'superadmin@irs.com',
        phone: '+923001234567',
        cnic: '12345-1234567-1',
        password: '123456',
        role: 'superadmin',
        status: 'active'
      },
      {
        name: 'Admin User',
        email: 'admin@irs.com',
        phone: '+923001234568',
        cnic: '12345-1234567-2',
        password: '123456',
        role: 'admin',
        status: 'active'
      },
      {
        name: 'Edhi Ambulance Service',
        email: 'edhi@irs.com',
        phone: '+923001234569',
        cnic: '12345-1234567-3',
        password: '123456',
        role: 'department',
        department: 'Edhi Foundation',
        status: 'active'
      },
      {
        name: 'Chippa Ambulance Service',
        email: 'chippa@irs.com',
        phone: '+923001234570',
        cnic: '12345-1234567-4',
        password: '123456',
        role: 'department',
        department: 'Chippa Ambulance',
        status: 'active'
      },
      {
        name: 'Edhi Driver',
        email: 'driver@irs.com',
        phone: '+923001234571',
        cnic: '12345-1234567-5',
        password: '123456',
        role: 'driver',
        department: 'Edhi Foundation',
        ambulanceService: 'Edhi Foundation',
        drivingLicense: 'DL-123456',
        status: 'active'
      },
      {
        name: 'Jinnah Hospital',
        email: 'hospital@irs.com',
        phone: '+923001234572',
        cnic: '12345-1234567-6',
        password: '123456',
        role: 'hospital',
        hospital: 'Jinnah Hospital',
        status: 'active'
      },
      {
        name: 'Citizen User',
        email: 'citizen@irs.com',
        phone: '+923001234573',
        cnic: '12345-1234567-7',
        password: '123456',
        role: 'citizen',
        status: 'active'
      }
    ];

    const createdUsers = [];
    for (const userData of defaultUsers) {
      const user = await User.create(userData);
      createdUsers.push({
        email: user.email,
        role: user.role,
        password: '123456'
      });
      console.log(`✅ Created user: ${userData.email} (${userData.role})`);
    }
    
    res.json({
      success: true,
      message: '🎉 Ambulance-only system reset successfully!',
      instructions: 'Use superadmin@irs.com with password 123456 to login.',
      usersCreated: createdUsers.length,
      users: createdUsers
    });
    
  } catch (error) {
    console.error('❌ Error in hard reset:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting users: ' + error.message
    });
  }
});

router.get('/network-info', (req, res) => {
  const { getAllIPs } = require('../utils/helpers');
  const ips = getAllIPs();
  
  res.json({
    success: true,
    data: {
      server: {
        port: process.env.PORT || 5000,
        environment: process.env.NODE_ENV || 'development'
      },
      network: {
        interfaces: ips,
        urls: ips.map(ip => `http://${ip.address}:${process.env.PORT || 5000}`),
        mobile: {
          androidEmulator: 'http://10.0.2.2:5000',
          genymotion: 'http://10.0.3.2:5000'
        }
      }
    }
  });
});

// API Routes
router.use('/auth', authRoutes);
router.use('/incidents', incidentRoutes);
router.use('/users', userRoutes);
router.use('/notifications', notificationRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/upload', uploadRoutes);
router.use('/admin', require('./admin'));
router.use('/drivers', dummyDriverRoutes);

// Root endpoint
router.get('/', (req, res) => {
  const { getAllIPs } = require('../utils/helpers');
  const ips = getAllIPs();
  
  res.json({
    success: true,
    message: '🎉 Incident Reporting System API is Running!',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      network: '/api/network-info', 
      auth: '/api/auth',
      incidents: '/api/incidents',
      users: '/api/users',
      dashboard: '/api/dashboard',
      upload: '/api/upload'
    },
    accessUrls: ips.map(ip => `http://${ip.address}:${process.env.PORT || 5000}`)
  });
});

module.exports = router;