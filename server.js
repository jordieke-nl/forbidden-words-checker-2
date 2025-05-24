const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import routes
const uploadRoutes = require('./routes/upload');
const healthRoutes = require('./routes/health');
const webhookRoutes = require('./routes/webhook');
const chatRoutes = require('./routes/chat');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy configuration for X-Forwarded-For header
app.set('trust proxy', 1);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware configuration
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://chat.openai.com', 'https://chatgpt.com'],
  credentials: true
}));

// Rate limiting with proper IP detection
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: 'Too many requests from this IP',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Trust X-Forwarded-For header
  keyGenerator: (req) => {
    return req.ip; // This will now use the correct IP from X-Forwarded-For
  }
});
app.use('/api/', limiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 // 10MB
  },
  fileFilter: fileFilter
});

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Forbidden Words Checker API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      upload: '/api/upload',
      health: '/api/health',
      webhook: '/api/webhook',
      chat: '/api/chat'
    },
    baseUrl: 'https://forbidden-words-checker-2.onrender.com'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    service: 'forbidden-words-checker-2',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    baseUrl: 'https://forbidden-words-checker-2.onrender.com',
    nodeVersion: process.version
  });
});

// Temporary upload endpoint for testing
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        error: 'No file uploaded',
        code: 'NO_FILE'
      });
    }

    // Basic response for now - will be replaced with full analysis
    res.json({
      status: 'success',
      message: 'File uploaded successfully',
      document: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
      total_violations: 0,
      violations: [],
      processing_time: 0.1
    });

    // Clean up uploaded file
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error deleting file:', err);
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      code: 'PROCESSING_ERROR'
    });
  }
});

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/chat', chatRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        status: 'error',
        error: 'File too large. Maximum size: 10MB',
        code: 'FILE_TOO_LARGE'
      });
    }
  }
  
  res.status(500).json({ 
    status: 'error',
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    error: 'Endpoint not found',
    code: 'NOT_FOUND'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
}); 