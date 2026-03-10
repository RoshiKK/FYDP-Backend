const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const { Server } = require('socket.io'); // 👈 ADD THIS
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
dotenv.config();
const PORT = process.env.PORT || 5000;

const connectDatabase = require('./config/database');
connectDatabase();

const uploadRoutes = require('./routes/upload');

const app = express();
const server = http.createServer(app); // ✅ already have this


// =====================
// SOCKET.IO SETUP 👈 ADD THIS ENTIRE BLOCK
// =====================
const io = new Server(server, {
  cors: {
    origin: '*', // tighten this in production
    methods: ['GET', 'POST']
  }
});
// In server.js, update the socket.io connection handler
// io.on('connection', (socket) => {
//   console.log('🔌 Client connected:', socket.id);
  
//   // Log all rooms when joining
//   socket.on('join_admin', (adminId) => {
//     socket.join('admins');
//     console.log(`👮 Admin ${adminId} joined admins room`);
//     console.log(`📊 Current rooms for ${socket.id}:`, Array.from(socket.rooms));
//   });

//   socket.on('join_department', (departmentName) => {
//     socket.join('departments');           // generic room — gets ALL approved incidents
//     socket.join(`dept_${departmentName}`); // specific room — for targeted messages later
    
//     console.log(`🏢 Department ${departmentName} joined departments room`);
//     console.log(`📊 Current rooms for ${socket.id}:`, Array.from(socket.rooms));
    
//     // Send confirmation back to client
//     socket.emit('department_joined', {
//       success: true,
//       department: departmentName,
//       message: 'Successfully joined department room'
//     });
//   });

//   // Citizen joins to track their own incident
//   socket.on('join_citizen', (userId) => {
//     socket.join(`citizen_${userId}`);
//     console.log(`👤 Citizen ${userId} joined their room`);
//   });

//   socket.on('disconnect', () => {
//     console.log('🔌 Disconnected:', socket.id);
//   });

//   // Add ping-pong for connection testing
//   socket.on('ping', (data) => {
//     console.log('🏓 Ping received from:', socket.id);
//     socket.emit('pong', { received: data, time: new Date().toISOString() });
//   });
// }


io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  // Admin joins
  socket.on('join_admin', (adminId) => {
    socket.join('admins');
    console.log(`👮 Admin ${adminId} joined admins room`);
  });

  // Department joins
  socket.on('join_department', (departmentName) => {
    socket.join('departments');
    socket.join(`dept_${departmentName}`);
    console.log(`🏢 Department ${departmentName} joined departments room`);
    
    socket.emit('department_joined', {
      success: true,
      department: departmentName,
      message: 'Successfully joined department room'
    });
  });

  // 🔥 NEW: Driver joins their personal room
  socket.on('join_driver', (driverId) => {
    socket.join(`driver_${driverId}`);
    console.log(`🚗 Driver ${driverId} joined their room`);
    
    socket.emit('driver_joined', {
      success: true,
      driverId: driverId,
      message: 'Successfully joined driver room'
    });
  });

  // Citizen joins
  socket.on('join_citizen', (userId) => {
    socket.join(`citizen_${userId}`);
    console.log(`👤 Citizen ${userId} joined their room`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Disconnected:', socket.id);
  });

  socket.on('ping', (data) => {
    console.log('🏓 Ping received from:', socket.id);
    socket.emit('pong', { received: data, time: new Date().toISOString() });
  });
});
// In server.js, after io initialization
const assignmentQueue = require('./services/assignmentqueue');
assignmentQueue.initialize(io);
console.log('✅ Assignment queue initialized with Socket.IO');


// Make queue available to routes
app.use((req, res, next) => {
  req.assignmentQueue = assignmentQueue;
  next();
});
// Add a debug endpoint to check socket connections
app.get('/api/socket/debug', (req, res) => {
  const rooms = io.sockets.adapter.rooms;
  const sockets = io.sockets.sockets;
  
  const debug = {
    totalConnections: sockets.size,
    rooms: {}
  };
  
  rooms.forEach((sockets, room) => {
    if (!room.startsWith('/')) { // Filter out default rooms
      debug.rooms[room] = sockets.size;
    }
  });
  
  res.json({
    success: true,
    debug
  });
});
  // In server.js socket.on('connection') block, add:
// socket.on('join_department', (department) => {
//   socket.join(department); // e.g. 'Edhi Foundation'
//   console.log(`🏢 Department user joined: ${department}`);
// });


// =====================
// ATTACH io TO EVERY REQUEST 👈 ADD THIS
// =====================
app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use(cors());

// =====================
// CORS CONFIG
// =====================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5000', // 👈 ADD THIS
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

// app.use(cors(corsOptions));
// app.options('*', cors(corsOptions));

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