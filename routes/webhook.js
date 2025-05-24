const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../middleware/errorHandler');
const textExtractor = require('../services/textExtractor');
const wordDetector = require('../services/wordDetector');
const logger = require('../utils/logger');

// Configure multer for webhook
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4();
    cb(null, `webhook-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (textExtractor.isSupportedMimeType(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Unsupported file type', 400), false);
    }
  }
});

// Webhook endpoint for ChatGPT
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    logger.info(`Processing webhook file: ${req.file.originalname}`);

    // Extract text from file
    const extractedData = await textExtractor.extract(req.file.path, req.file.mimetype);

    // Detect forbidden words
    const violations = wordDetector.detect(extractedData.text, extractedData.pages);

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    // Prepare response for ChatGPT
    const response = {
      success: true,
      apiUrl: process.env.BASE_URL || 'http://localhost:3000',
      document: req.file.originalname,
      total_violations: violations.length,
      violations: violations.map(violation => ({
        word: violation.word,
        page: violation.page,
        context: violation.context,
        recommendation: violation.recommendation,
        explanation: violation.explanation,
        category: violation.category,
        language: violation.language
      }))
    };

    logger.info(`Webhook file processed successfully: ${req.file.originalname}`);
    res.json(response);

  } catch (error) {
    // Clean up file if it exists
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        logger.error(`Error deleting webhook file: ${unlinkError.message}`);
      }
    }

    logger.error('Webhook processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      apiUrl: process.env.BASE_URL || 'http://localhost:3000'
    });
  }
});

module.exports = router; 