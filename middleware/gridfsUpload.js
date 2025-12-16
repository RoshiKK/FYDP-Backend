// middleware/gridfsUpload.js
const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');

// Create storage engine for GridFS with lazy initialization
let storage = null;
let upload = null;

// Initialize GridFS storage only when needed (lazy loading)
const initializeGridFS = async () => {
  try {
    console.log('🔄 Initializing GridFS storage...');
    
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    storage = new GridFsStorage({
      url: process.env.MONGODB_URI,
      file: (req, file) => {
        return new Promise((resolve, reject) => {
          crypto.randomBytes(16, (err, buf) => {
            if (err) {
              return reject(err);
            }
            const filename = buf.toString('hex') + path.extname(file.originalname);
            const fileInfo = {
              filename: filename,
              bucketName: 'uploads'
            };
            resolve(fileInfo);
          });
        });
      }
    });

    console.log('✅ GridFS storage initialized successfully');
    return storage;
  } catch (error) {
    console.error('❌ Error initializing GridFS storage:', error.message);
    throw error;
  }
};

const initializeUpload = async () => {
  try {
    if (!storage) {
      await initializeGridFS();
    }
    
    if (!storage) {
      throw new Error('GridFS storage not initialized');
    }
    
    upload = multer({
      storage: storage,
      fileFilter: fileFilter,
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 5 // Maximum 5 files
      }
    });

    console.log('✅ Multer GridFS upload middleware initialized');
    return upload;
  } catch (error) {
    console.error('❌ Error initializing upload middleware:', error);
    return null;
  }
};

// File filter
const fileFilter = (req, file, cb) => {
  console.log('📁 File upload attempt:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size
  });

  // Check if file is an image
  const isImageByMimeType = file.mimetype.startsWith('image/');
  const isImageByExtension = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.originalname);
  const isOctetStreamWithImageExt = file.mimetype === 'application/octet-stream' && 
                                   /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.originalname);

  if (isImageByMimeType || isImageByExtension || isOctetStreamWithImageExt) {
    console.log('✅ File accepted:', file.originalname);
    cb(null, true);
  } else {
    console.log('❌ Rejected file type:', file.mimetype, 'filename:', file.originalname);
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Error handling middleware
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 5 files allowed.'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name for file upload.'
      });
    }
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  next();
};

// Export a function to get the upload middleware
module.exports = {
  getUpload: async () => {
    if (!upload) {
      upload = await initializeUpload();
    }
    return upload;
  },
  initializeGridFS,
  handleUploadErrors,
  // Export the middleware directly for routes that need it
  uploadMiddleware: async (req, res, next) => {
    if (!upload) {
      upload = await initializeUpload();
    }
    
    if (!upload) {
      return res.status(500).json({
        success: false,
        message: 'Upload service not available'
      });
    }
    
    return upload.array('photos', 5)(req, res, next);
  }
};