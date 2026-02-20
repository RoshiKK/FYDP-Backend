const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'KHIVISION API',
      version: '1.0.0',
      description: 'API documentation for the KHIVISIONSystem',
      contact: {
        name: 'API Support',
        email: 'support@irs.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000/api',
        description: 'Development server'
      },
      {
        url: 'https://fydp-backend-production.up.railway.app/api',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token'
        }
      },
      schemas: {
        User: {
          type: 'object',
          required: ['name', 'email', 'phone', 'cnic', 'password'],
          properties: {
            _id: { type: 'string', description: 'User ID' },
            name: { type: 'string', description: 'Full name' },
            email: { type: 'string', format: 'email', description: 'Email address' },
            phone: { type: 'string', description: 'Phone number' },
            cnic: { type: 'string', description: 'CNIC number' },
            role: { 
              type: 'string', 
              enum: ['superadmin', 'admin', 'department', 'driver', 'hospital', 'citizen'],
              description: 'User role'
            },
            department: { 
              type: 'string', 
              enum: ['Edhi Foundation', 'Chippa Ambulance'],
              description: 'Department (for department/driver users)'
            },
            hospital: { type: 'string', description: 'Hospital name (for hospital users)' },
            ambulanceService: { type: 'string', description: 'Ambulance service (for drivers)' },
            drivingLicense: { type: 'string', description: 'Driving license number (for drivers)' },
            status: { 
              type: 'string', 
              enum: ['active', 'inactive', 'suspended'],
              default: 'active'
            },
            lastLogin: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Incident: {
          type: 'object',
          properties: {
            _id: { type: 'string', description: 'Incident ID' },
            reportedBy: { type: 'string', description: 'User ID who reported' },
            description: { type: 'string', default: 'Accident reported' },
            category: { type: 'string', enum: ['Accident'], default: 'Accident' },
            priority: { 
              type: 'string', 
              enum: ['low', 'medium', 'high', 'urgent'],
              default: 'high'
            },
            location: {
              type: 'object',
              properties: {
                type: { type: 'string', default: 'Point' },
                coordinates: { 
                  type: 'array', 
                  items: { type: 'number' },
                  description: '[longitude, latitude]'
                },
                address: { type: 'string' }
              }
            },
            photos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  filename: { type: 'string' },
                  originalName: { type: 'string' },
                  url: { type: 'string' }
                }
              }
            },
            status: { 
              type: 'string', 
              enum: ['pending', 'approved', 'rejected', 'assigned', 'in_progress', 'completed', 'cancelled'],
              default: 'pending'
            },
            driverStatus: { 
              type: 'string', 
              enum: ['assigned', 'arrived', 'transporting', 'delivered', 'completed'],
              default: 'assigned'
            },
            hospitalStatus: { 
              type: 'string', 
              enum: ['pending', 'incoming', 'admitted', 'discharged', 'cancelled'],
              default: 'pending'
            },
            assignedTo: {
              type: 'object',
              properties: {
                department: { type: 'string' },
                driver: { type: 'string' },
                driverName: { type: 'string' },
                assignedAt: { type: 'string', format: 'date-time' }
              }
            },
            patientStatus: {
              type: 'object',
              properties: {
                condition: { type: 'string' },
                hospital: { type: 'string' },
                medicalNotes: { type: 'string' },
                doctor: { type: 'string' },
                bedNumber: { type: 'string' }
              }
            }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', format: 'password' }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            token: { type: 'string' },
            user: { $ref: '#/components/schemas/User' }
          }
        },
        RegisterRequest: {
          type: 'object',
          required: ['name', 'email', 'phone', 'cnic', 'password', 'role'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            cnic: { type: 'string' },
            password: { type: 'string', format: 'password', minLength: 6 },
            role: { 
              type: 'string', 
              enum: ['citizen', 'driver', 'department', 'hospital']
            },
            department: { 
              type: 'string',
              enum: ['Edhi Foundation', 'Chippa Ambulance'],
              description: 'Required for driver/department'
            },
            hospital: { type: 'string', description: 'Required for hospital' },
            ambulanceService: { type: 'string', description: 'Required for driver' },
            drivingLicense: { type: 'string', description: 'Required for driver' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', default: false },
            message: { type: 'string' }
          }
        }
      }
    },
    security: [{
      bearerAuth: []
    }],
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Incidents', description: 'Incident management' },
      { name: 'Users', description: 'User management' },
      { name: 'Dashboard', description: 'Dashboard data' },
      { name: 'Notifications', description: 'Notification management' },
      { name: 'Admin', description: 'Admin operations' },
      { name: 'Health', description: 'Health check endpoints' }
    ]
  },
  apis: [
    './routes/*.js',
    './controllers/*.js',
    './models/*.js'
  ]
};

module.exports = swaggerJsdoc(options);