const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required']
  },
  cnic: {
    type: String,
    required: [true, 'CNIC is required'],
    unique: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'department', 'driver', 'hospital', 'citizen'],
    default: 'citizen'
  },
  department: {
  type: String,
  enum: ['Edhi Foundation', 'Chippa Ambulance'],
  required: function() {
    // Only require department for driver and department roles
    return this.role === 'driver' || this.role === 'department';
  }
},
  hospital: {
    type: String
  },
  ambulanceService: {
    type: String
  },
  drivingLicense: {
    type: String
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  restrictionEndDate: {
    type: Date
  },
  lastLogin: {
    type: Date
  },
  fcmToken: {
    type: String
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    },
    address: String
  }
}, {
  timestamps: true
});

// Geospatial index for location-based queries
userSchema.index({ location: '2dsphere' });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to check password - FIXED for mobile app compatibility
userSchema.methods.correctPassword = async function(candidatePassword) {
  if (!candidatePassword || !this.password) {
    console.log('❌ Password comparison failed: missing password data');
    return false;
  }
  
  try {
    const result = await bcrypt.compare(candidatePassword, this.password);
    console.log(`🔑 Password comparison result: ${result}`);
    return result;
  } catch (error) {
    console.error('❌ Password comparison error:', error);
    return false;
  }
};

// Alias method for mobile app compatibility
userSchema.methods.checkPassword = async function(candidatePassword) {
  return this.correctPassword(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);