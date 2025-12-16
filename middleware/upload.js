const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    // Create a unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, 'incident-' + uniqueSuffix + extension);
  }
});

// Enhanced file filter - FIXED for mobile camera uploads
const fileFilter = (req, file, cb) => {
  console.log('📁 File upload attempt:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size
  });

  // Check if file is an image by MIME type OR file extension
  const isImageByMimeType = file.mimetype.startsWith('image/');
  const isImageByExtension = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.originalname);
  
  // Accept application/octet-stream if it has image file extension (common from mobile cameras)
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

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files
  }
});

// Error handling middleware for multer
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

module.exports = upload;
module.exports.handleUploadErrors = handleUploadErrors;