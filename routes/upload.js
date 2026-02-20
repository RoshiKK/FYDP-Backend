/**
 * @swagger
 * tags:
 *   name: Upload
 *   description: File upload endpoints
 */

/**
 * @swagger
 * /upload/incident-photos:
 *   post:
 *     summary: Upload incident photos to GridFS
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Image files (max 5, 10MB each)
 *     responses:
 *       200:
 *         description: Photos uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       filename:
 *                         type: string
 *                       originalName:
 *                         type: string
 *                       size:
 *                         type: number
 *                       mimetype:
 *                         type: string
 *       400:
 *         description: Upload failed
 */

/**
 * @swagger
 * /upload/image/{filename}:
 *   get:
 *     summary: Get image from GridFS by filename
 *     tags: [Upload]
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Image filename
 *     responses:
 *       200:
 *         description: Image file
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Image not found
 */
const express = require('express');
const router = express.Router();
const { uploadMiddleware, handleUploadErrors } = require('../middleware/gridfsUpload');
const { protect } = require('../middleware/auth');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

// @desc    Upload incident photos to GridFS
// @route   POST /api/upload/incident-photos
// @access  Private
router.post('/incident-photos', protect, async (req, res, next) => {
  try {
    // Use the middleware function that handles initialization
    await uploadMiddleware(req, res, async (err) => {
      if (err) {
        return handleUploadErrors(err, req, res, next);
      }
      
      try {
        console.log('📸 Processing uploaded photos:', req.files?.length || 0);

        if (!req.files || req.files.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'No photos uploaded'
          });
        }

        const photos = req.files.map(file => ({
          filename: file.filename,
          originalName: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          uploadedAt: new Date()
        }));

        console.log('✅ Photos uploaded to GridFS successfully:', photos.length);

        res.status(200).json({
          success: true,
          data: photos
        });
      } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({
          success: false,
          message: 'Photos upload failed: ' + error.message
        });
      }
    });
  } catch (error) {
    console.error('❌ Error in upload route:', error);
    res.status(500).json({
      success: false,
      message: 'Upload service error: ' + error.message
    });
  }
});

// @desc    Get image from GridFS
// @route   GET /api/upload/image/:filename
// @access  Public
router.get('/image/:filename', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    
    if (!db) {
      return res.status(500).json({
        success: false,
        message: 'Database not connected'
      });
    }

    const bucket = new GridFSBucket(db, { bucketName: 'uploads' });
    
    const files = await db.collection('uploads.files').find({ filename: req.params.filename }).toArray();
    
    if (!files || files.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Set proper content type
    res.set('Content-Type', files[0].contentType || 'image/jpeg');
    
    const downloadStream = bucket.openDownloadStreamByName(req.params.filename);
    
    downloadStream.on('error', (error) => {
      console.error('❌ Stream error:', error);
      res.status(404).json({
        success: false,
        message: 'File not found'
      });
    });
    
    downloadStream.pipe(res);
  } catch (error) {
    console.error('❌ Error retrieving image:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving image'
    });
  }
});

// @desc    Test GridFS endpoint
// @route   GET /api/upload/test
// @access  Public
router.get('/test', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    const gridfsCollections = collections.filter(c => 
      c.name === 'uploads.files' || c.name === 'uploads.chunks'
    );
    
    res.json({
      success: true,
      message: 'GridFS upload endpoint is working',
      environment: process.env.NODE_ENV || 'development',
      mongodbUri: process.env.MONGODB_URI ? 'Set (hidden)' : 'Not set',
      gridfs: {
        available: gridfsCollections.length === 2,
        collections: gridfsCollections.map(c => c.name)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error testing GridFS: ' + error.message
    });
  }
});

// @desc    Get all uploaded files
// @route   GET /api/upload/files
// @access  Private (Admin)
router.get('/files', protect, async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const files = await db.collection('uploads.files').find().toArray();
    
    res.status(200).json({
      success: true,
      data: files
    });
  } catch (error) {
    console.error('❌ Error getting files:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving files'
    });
  }
});

// @desc    Upload single file
// @route   POST /api/upload/single
// @access  Private
router.post('/single', protect, async (req, res, next) => {
  try {
    // Use the middleware function that handles initialization
    await (async (req, res, next) => {
      const { getUpload } = require('../middleware/gridfsUpload');
      const upload = await getUpload();
      
      if (!upload) {
        return res.status(500).json({
          success: false,
          message: 'Upload service not available'
        });
      }
      
      return upload.single('file')(req, res, next);
    })(req, res, async (err) => {
      if (err) {
        return handleUploadErrors(err, req, res, next);
      }
      
      try {
        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: 'No file uploaded'
          });
        }

        res.status(200).json({
          success: true,
          data: {
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype,
            originalName: req.file.originalname
          }
        });
      } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({
          success: false,
          message: 'File upload failed: ' + error.message
        });
      }
    });
  } catch (error) {
    console.error('❌ Error in upload route:', error);
    res.status(500).json({
      success: false,
      message: 'Upload service error: ' + error.message
    });
  }
});

// @desc    Upload multiple files
// @route   POST /api/upload/multiple
// @access  Private
router.post('/multiple', protect, async (req, res, next) => {
  try {
    // Use the middleware function that handles initialization
    await (async (req, res, next) => {
      const { getUpload } = require('../middleware/gridfsUpload');
      const upload = await getUpload();
      
      if (!upload) {
        return res.status(500).json({
          success: false,
          message: 'Upload service not available'
        });
      }
      
      return upload.array('files', 10)(req, res, next);
    })(req, res, async (err) => {
      if (err) {
        return handleUploadErrors(err, req, res, next);
      }
      
      try {
        if (!req.files || req.files.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'No files uploaded'
          });
        }

        const files = req.files.map(file => ({
          filename: file.filename,
          size: file.size,
          mimetype: file.mimetype,
          originalName: file.originalname
        }));

        res.status(200).json({
          success: true,
          data: files
        });
      } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({
          success: false,
          message: 'Files upload failed: ' + error.message
        });
      }
    });
  } catch (error) {
    console.error('❌ Error in upload route:', error);
    res.status(500).json({
      success: false,
      message: 'Upload service error: ' + error.message
    });
  }
});
router.get('/debug-gridfs', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    
    // Get all files in GridFS
    const files = await db.collection('uploads.files').find().toArray();
    
    // Get all incidents with photos
    const Incident = require('../models/Incident');
    const incidents = await Incident.find({ 'photos': { $exists: true, $ne: [] } })
      .limit(20)
      .lean();
    
    res.json({
      success: true,
      gridfs: {
        totalFiles: files.length,
        files: files.map(f => ({
          filename: f.filename,
          contentType: f.contentType,
          length: f.length,
          uploadDate: f.uploadDate,
          metadata: f.metadata
        }))
      },
      incidentsWithPhotos: incidents.map(inc => ({
        id: inc._id,
        description: inc.description,
        photoCount: inc.photos?.length || 0,
        photos: inc.photos?.map(p => ({
          filename: p.filename,
          url: p.url,
          originalName: p.originalName
        })) || []
      })),
      testUrls: files.slice(0, 3).map(f => ({
        filename: f.filename,
        uploadUrl: `http://${req.headers.host}/api/upload/image/${f.filename}`,
        uploadsUrl: `http://${req.headers.host}/api/uploads/image/${f.filename}`
      }))
    });
    
  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// @desc    Debug GridFS uploads
// @route   GET /api/upload/debug
// @access  Public
router.get('/debug', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    
    // Check if collections exist
    const collections = await db.listCollections().toArray();
    const gridfsCollections = collections.filter(c => 
      c.name === 'uploads.files' || c.name === 'uploads.chunks'
    );
    
    // Get all files in GridFS
    const files = await db.collection('uploads.files').find().toArray();
    
    // Get recent incidents with photos
    const Incident = require('../models/Incident');
    const incidents = await Incident.find({ 'photos': { $exists: true, $ne: [] } })
      .limit(10)
      .lean();
    
    res.json({
      success: true,
      gridfs: {
        collections: gridfsCollections.map(c => c.name),
        totalFiles: files.length,
        files: files.map(f => ({
          filename: f.filename,
          contentType: f.contentType,
          length: f.length,
          uploadDate: f.uploadDate,
          metadata: f.metadata
        }))
      },
      incidents: incidents.map(inc => ({
        id: inc._id,
        photoCount: inc.photos?.length || 0,
        photos: inc.photos || []
      }))
    });
  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


module.exports = router;