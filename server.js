const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import routes
const uploadRoutes = require('./routes/upload');
const healthRoutes = require('./routes/health');
const webhookRoutes = require('./routes/webhook');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Middleware configuration
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Base route
app.get('/', (req, res) => {
  res.json({
    message: 'Forbidden Words Checker API',
    version: '1.0.0',
    endpoints: {
      upload: '/api/upload',
      health: '/api/health',
      webhook: '/api/webhook'
    },
    baseUrl: process.env.BASE_URL || 'http://localhost:3000'
  });
});

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/webhook', webhookRoutes);

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
}); 