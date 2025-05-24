const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');
const FormData = require('form-data');
const fetch = require('node-fetch');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, and TXT files are allowed.'));
    }
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  let uploadedFilePath = null;
  
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        error: 'No file uploaded',
        code: 'NO_FILE'
      });
    }

    uploadedFilePath = req.file.path;

    // Create form data for the API request
    const formData = new FormData();
    formData.append('file', fs.createReadStream(uploadedFilePath));

    // Make request to forbidden words checker API
    const response = await fetch('https://forbidden-words-checker-2.onrender.com/api/webhook', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const result = await response.json();

    // Create ChatGPT completion with the result
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that analyzes documents for forbidden words."
        },
        {
          role: "user",
          content: `Please analyze this document for forbidden words: ${req.file.originalname}`
        },
        {
          role: "assistant",
          content: JSON.stringify(result)
        }
      ]
    });

    res.json(completion);

  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({
      status: 'error',
      error: error.message || 'Error processing file',
      code: 'PROCESSING_ERROR'
    });
  } finally {
    // Clean up uploaded file
    if (uploadedFilePath) {
      try {
        await fs.unlink(uploadedFilePath);
      } catch (error) {
        console.error('Error deleting uploaded file:', error);
      }
    }
  }
});

module.exports = router; 