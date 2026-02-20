/**
 * @swagger
 * components:
 *   schemas:
 *     Location:
 *       type: object
 *       required:
 *         - coordinates
 *         - address
 *       properties:
 *         type:
 *           type: string
 *           enum: [Point]
 *           default: Point
 *         coordinates:
 *           type: array
 *           items:
 *             type: number
 *           description: [longitude, latitude]
 *         address:
 *           type: string
 *     
 *     AssignedTo:
 *       type: object
 *       properties:
 *         department:
 *           type: string
 *           enum: [Edhi Foundation, Chippa Ambulance]
 *         driver:
 *           type: string
 *           description: Driver ID
 *         driverName:
 *           type: string
 *         assignedAt:
 *           type: string
 *           format: date-time
 *         assignedBy:
 *           type: string
 *           description: User ID who assigned
 *     
 *     PatientStatus:
 *       type: object
 *       properties:
 *         condition:
 *           type: string
 *         hospital:
 *           type: string
 *         medicalNotes:
 *           type: string
 *         treatment:
 *           type: string
 *         doctor:
 *           type: string
 *         bedNumber:
 *           type: string
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     Action:
 *       type: object
 *       properties:
 *         action:
 *           type: string
 *         performedBy:
 *           type: string
 *           description: User ID
 *         timestamp:
 *           type: string
 *           format: date-time
 *         details:
 *           type: object
 *     
 *     Timestamps:
 *       type: object
 *       properties:
 *         reportedAt:
 *           type: string
 *           format: date-time
 *         assignedAt:
 *           type: string
 *           format: date-time
 *         arrivedAt:
 *           type: string
 *           format: date-time
 *         transportingAt:
 *           type: string
 *           format: date-time
 *         deliveredAt:
 *           type: string
 *           format: date-time
 *         admittedAt:
 *           type: string
 *           format: date-time
 *         dischargedAt:
 *           type: string
 *           format: date-time
 *         completedAt:
 *           type: string
 *           format: date-time
 */
const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema({
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  description: {
    type: String,
    default: 'Accident reported'
  },

  category: {
    type: String,
    enum: ['Accident'],
    required: true,
    default: 'Accident'
  },

  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'high'
  },

  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true
    },
    address: {
      type: String,
      required: true
    }
  },

  photos: [{
    filename: String,  // GridFS filename
    originalName: String,
    size: Number,
    mimetype: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // MAIN STATUS - Overall incident status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'assigned', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },

  // DRIVER WORKFLOW STATUS
  driverStatus: {
    type: String,
    enum: ['assigned', 'arrived', 'transporting', 'delivered', 'completed'],
    default: 'assigned'
  },

  // HOSPITAL WORKFLOW STATUS
  hospitalStatus: {
    type: String,
    enum: ['pending', 'incoming', 'admitted', 'discharged', 'cancelled'],
    default: 'pending'
  },

  aiDetectionScore: {
    type: Number,
    min: 0,
    max: 100
  },

  assignedTo: {
    department: {
      type: String,
      enum: ['Edhi Foundation', 'Chippa Ambulance']
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    driverName: String,
    assignedAt: Date,
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },

  actions: [{
    action: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: Object
  }],

  patientStatus: {
    condition: String,
    hospital: String,
    medicalNotes: String,
    treatment: String,
    doctor: String,
    bedNumber: String,
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },

  timestamps: {
    reportedAt: {
      type: Date,
      default: Date.now
    },
    assignedAt: Date,
    arrivedAt: Date,
    transportingAt: Date,
    deliveredAt: Date,
    admittedAt: Date,
    dischargedAt: Date,
    completedAt: Date
  }

}, {
  timestamps: true
});

// Pre-save middleware to handle workflow transitions
incidentSchema.pre('save', function(next) {
  // Initialize timestamps if not exists
  if (!this.timestamps) {
    this.timestamps = {};
  }
  
  // Set reportedAt timestamp if not set
  if (!this.timestamps.reportedAt) {
    this.timestamps.reportedAt = this.createdAt || new Date();
  }

  // Auto-update timestamps based on status changes
  if (this.isModified('driverStatus')) {
    const now = new Date();
    switch (this.driverStatus) {
      case 'arrived':
        this.timestamps.arrivedAt = now;
        break;
      case 'transporting':
        this.timestamps.transportingAt = now;
        break;
      case 'delivered':
        this.timestamps.deliveredAt = now;
        // When delivered, update hospital status to incoming
        this.hospitalStatus = 'incoming';
        break;
      case 'completed':
        this.timestamps.completedAt = now;
        break;
    }
  }

  if (this.isModified('hospitalStatus')) {
    const now = new Date();
    switch (this.hospitalStatus) {
      case 'incoming':
        // No specific timestamp for incoming
        break;
      case 'admitted':
        this.timestamps.admittedAt = now;
        break;
      case 'discharged':
        this.timestamps.dischargedAt = now;
        // When discharged, mark incident as completed
        this.status = 'completed';
        this.driverStatus = 'completed';
        this.timestamps.completedAt = now;
        break;
    }
  }

  next();
});

// Indexes for better performance
incidentSchema.index({ location: '2dsphere' });
incidentSchema.index({ status: 1 });
incidentSchema.index({ driverStatus: 1 });
incidentSchema.index({ hospitalStatus: 1 });
incidentSchema.index({ createdAt: -1 });
incidentSchema.index({ 'assignedTo.driver': 1 });

module.exports = mongoose.model('Incident', incidentSchema);