const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

// ✅ Swagger
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

// Load env FIRST
dotenv.config();

const PORT = process.env.PORT || 5000;

// Database
const connectDatabase = require('./config/database');
connectDatabase();

// Routes
const uploadRoutes = require('./routes/upload');

// App setup
const app = express();
const server = http.createServer(app);

// =====================
// CORS CONFIG
// =====================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://10.0.2.2:5000',
  'capacitor://localhost',
  'ionic://localhost',
  ...(process.env.WEB_APP_URL ? [process.env.WEB_APP_URL] : [])
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// =====================
// MIDDLEWARE
// =====================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =====================
// UPLOAD ROUTES
// =====================
app.use('/upload', uploadRoutes);

// =====================
// GRIDFS IMAGE HANDLER
// =====================
const serveGridFSImage = async (req, res) => {
  try {
    if (!mongoose.connection.db) {
      return res.status(500).json({
        success: false,
        message: 'Database not connected'
      });
    }

    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: 'uploads' });
    const filename = req.params.filename;

    const files = await db
      .collection('uploads.files')
      .find({ filename })
      .toArray();

    if (!files || files.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Image "${filename}" not found`
      });
    }

    res.set('Content-Type', files[0].contentType || 'image/jpeg');

    const downloadStream = bucket.openDownloadStreamByName(filename);

    downloadStream.on('error', () => {
      res.status(404).json({
        success: false,
        message: 'File not found'
      });
    });

    downloadStream.pipe(res);

  } catch (error) {
    console.error('❌ GridFS Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error serving image'
    });
  }
};

// Image routes
app.get('/api/upload/image/:filename', serveGridFSImage);
app.get('/api/uploads/image/:filename', serveGridFSImage);

// =====================
// HEALTH CHECK
// =====================
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Server running',
    time: new Date().toISOString()
  });
});

// =====================
// SWAGGER DOCUMENTATION
// =====================
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "Incident Reporting System API Documentation",
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true
  }
}));

app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.get('/docs', (req, res) => {
  res.redirect('/api-docs');
});

// =====================
// API ROUTES
// =====================
app.use('/api', require('./routes'));

// =====================
// ERROR HANDLING
// =====================
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// =====================
// START SERVER
// =====================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📚 Swagger Docs: http://localhost:${PORT}/api-docs`);
});