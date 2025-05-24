const express = require('express');
const router = express.Router();
const os = require('os');
const logger = require('../utils/logger');

router.get('/', (req, res) => {
  try {
    const healthData = {
      status: 'healthy',
      service: 'forbidden-words-checker-2',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem()
      },
      cpu: {
        cores: os.cpus().length,
        load: os.loadavg()
      },
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0'
    };

    logger.info('Health check successful', healthData);
    res.status(200).json(healthData);
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router; 