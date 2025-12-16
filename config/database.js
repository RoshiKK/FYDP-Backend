const mongoose = require('mongoose');

const connectDatabase = async () => {
  try {
    // Clear any existing connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    console.log('🔗 Connecting to MongoDB...');
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);

    // Create default admin user if not exists
    await createDefaultUsers();
    
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    process.exit(1);
  }
};

// Add connection event handlers
mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

module.exports = {
  connectDatabase
};

const createDefaultUsers = async () => {
  try {
    const User = require('../models/User');
    const bcrypt = require('bcryptjs');
    
    console.log('🔄 Checking/Creating default users...');
    
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
    name: 'Edhi Foundation Department',
    email: 'edhi@irs.com',
    phone: '+923001234569',
    cnic: '12345-1234567-3',
    password: '123456',
    role: 'department',
    department: 'Edhi Foundation',
    status: 'active'
  },
  {
    name: 'Chippa Ambulance Department',
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
    name: 'Chippa Driver',
    email: 'driver2@irs.com',
    phone: '+923001234572',
    cnic: '12345-1234567-6',
    password: '123456',
    role: 'driver',
    department: 'Chippa Ambulance',
    ambulanceService: 'Chippa Ambulance',
    drivingLicense: 'DL-123457',
    status: 'active'
  },
  {
    name: 'Jinnah Hospital',
    email: 'jinnah@irs.com',
    phone: '+923001234573', // Changed phone
    cnic: '12345-1234567-7', // Changed CNIC
    password: '123456',
    role: 'hospital',
    hospital: 'Jinnah Hospital',
    status: 'active'
  },
  {
    name: 'Aga Khan Hospital',
    email: 'aghakhan@irs.com', 
    phone: '+923001234574', // Changed phone
    cnic: '12345-1234567-8', // Changed CNIC
    password: '123456',
    role: 'hospital',
    hospital: 'Aga Khan Hospital',
    status: 'active'
  },
  {
    name: 'Civil Hospital',
    email: 'civil@irs.com',
    phone: '+923001234575', // Changed phone
    cnic: '12345-1234567-9', // Changed CNIC
    password: '123456',
    role: 'hospital',
    hospital: 'Civil Hospital',
    status: 'active'
  },
  {
    name: 'Indus Hospital',
    email: 'indus@irs.com',
    phone: '+923001234576', // Changed phone
    cnic: '12345-1234567-0', // Changed CNIC
    password: '123456',
    role: 'hospital',
    hospital: 'Indus Hospital',
    status: 'active'
  },
  {
    name: 'South City Hospital',
    email: 'southcity@irs.com',
    phone: '+923001234577', // Changed phone
    cnic: '12345-1234567-A', // Changed CNIC (using letter)
    password: '123456',
    role: 'hospital',
    hospital: 'South City Hospital',
    status: 'active'
  },
  {
    name: 'Citizen User',
    email: 'citizen@irs.com',
    phone: '+923001234578', // Changed phone
    cnic: '12345-1234567-B', // Changed CNIC (using letter)
    password: '123456',
    role: 'citizen',
    status: 'active'
  }
];

    for (const userData of defaultUsers) {
      const existingUser = await User.findOne({
        $or: [
          { email: userData.email },
          { cnic: userData.cnic }
        ]
      }).select('+password'); // IMPORTANT: Include password field

      if (!existingUser) {
        // Create new user - password will be hashed by pre-save hook
        const createdUser = await User.create(userData);
        console.log(`✅ Created user: ${userData.email} (${userData.role})`);
      } else {
        console.log(`⚠️ User already exists: ${userData.email} (${userData.role})`);
        
        // FIXED: Check if password needs reset using direct bcrypt comparison
        try {
          if (existingUser.password) {
            const isPasswordValid = await bcrypt.compare('123456', existingUser.password);
            if (!isPasswordValid) {
              console.log(`🔄 Resetting password for: ${userData.email}`);
              // Reset password by updating with plain text - will be hashed by pre-save
              existingUser.password = '123456';
              await existingUser.save();
              console.log(`✅ Password reset for: ${userData.email}`);
            } else {
              console.log(`✅ Password already correct for: ${userData.email}`);
            }
          } else {
            console.log(`🔄 Setting password for: ${userData.email} (no password found)`);
            existingUser.password = '123456';
            await existingUser.save();
          }
        } catch (error) {
          console.log(`🔄 Password corrupted for ${userData.email}, resetting...`);
          existingUser.password = '123456';
          await existingUser.save();
        }
      }
    }
    
    console.log('✅ Default users setup completed');
    
  } catch (error) {
    console.error('❌ Error in default users setup:', error.message);
    console.error('Stack trace:', error.stack);
  }
};

module.exports = connectDatabase;