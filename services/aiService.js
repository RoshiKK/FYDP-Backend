const axios = require('axios');
const FormData = require('form-data');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

/**
 * Service to handle communication with the KHIVISION AI model
 */
class AIService {
  constructor() {
    this.aiModelUrl = process.env.AI_MODEL_URL || 'http://localhost:5005/detect';
    this.bucketName = 'uploads';
  }

  /**
   * Detect accident in an image stored in GridFS
   * @param {string} filename GridFS filename
   * @returns {Promise<Object>} Detection results including score
   */
  async detectAccident(filename) {
    try {
      console.log(`🤖 AI: Analyzing photo ${filename} at ${this.aiModelUrl}`);
      
      const db = mongoose.connection.db;
      if (!db) throw new Error('Database not connected');

      const bucket = new GridFSBucket(db, { bucketName: this.bucketName });
      
      // 1. Fetch file from GridFS as buffer
      const buffer = await this._getFileBuffer(bucket, filename);
      
      // 2. Prepare multipart form data
      const form = new FormData();
      form.append('image', buffer, { 
        filename: filename,
        contentType: 'image/jpeg' // Fallback, we could look this up in files collection if needed
      });

      // 3. Send to AI model
      const response = await axios.post(this.aiModelUrl, form, {
        headers: {
          ...form.getHeaders(),
        },
        timeout: 10000 // 10 second timeout for AI processing
      });

      console.log(`✅ AI: Analysis complete for ${filename}. Score: ${response.data.score}`);
      
      return {
        success: true,
        score: response.data.score || 0,
        status: response.data.status || 'UNKNOWN',
        details: response.data
      };
    } catch (error) {
      console.error('❌ AI Service Error:', error.message);
      if (error.response) {
        console.error('AI Model returned error:', error.response.data);
      }
      
      // Return a safe failure object
      return {
        success: false,
        score: 0,
        status: 'ERROR',
        error: error.message
      };
    }
  }

  /**
   * Helper to convert GridFS stream to Buffer
   */
  async _getFileBuffer(bucket, filename) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const downloadStream = bucket.openDownloadStreamByName(filename);
      
      downloadStream.on('data', chunk => chunks.push(chunk));
      downloadStream.on('error', reject);
      downloadStream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}

module.exports = new AIService();
