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

// Configure multer storage
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
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  if (textExtractor.isSupportedMimeType(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Unsupported file type', 400), false);
  }
};

// Configure multer
const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 // 10MB
  },
  fileFilter
});

// Upload endpoint
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    logger.info(`Processing file: ${req.file.originalname}`);

    // Extract text from file
    const extractedData = await textExtractor.extract(req.file.path, req.file.mimetype);

    // Detect forbidden words
    const violations = wordDetector.detect(extractedData.text, extractedData.pages);

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    // Prepare response
    const response = {
      status: 'success',
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

    logger.info(`File processed successfully: ${req.file.originalname}`);
    res.json(response);

  } catch (error) {
    // Clean up file if it exists
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        logger.error(`Error deleting file: ${unlinkError.message}`);
      }
    }

    next(error);
  }
});

// Get supported file types
router.get('/supported-types', (req, res) => {
  res.json({
    status: 'success',
    supported_types: textExtractor.getSupportedMimeTypes()
  });
});

module.exports = router; 