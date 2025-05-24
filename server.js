require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();

// Enable CORS for all routes
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Content-Length', 'X-Requested-With'],
  exposedHeaders: ['Content-Length'],
  maxAge: 86400
}));

// Logging middleware
app.use((req, res, next) => {
  console.log('\n=== New Request ===');
  console.log('Time:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  next();
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = '/tmp';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    console.log('\n=== File Upload Details ===');
    console.log('Field name:', file.fieldname);
    console.log('Original name:', file.originalname);
    console.log('MIME type:', file.mimetype);
    console.log('Size:', file.size);
    
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/octet-stream'
    ];
    const allowedExtensions = ['.pdf', '.docx', '.doc'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      console.log('File type accepted');
      cb(null, true);
    } else {
      console.log('File type rejected:', file.mimetype, ext);
      cb(new Error('Ongeldig bestandstype. Upload een PDF of DOCX bestand.'));
    }
  },
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB limit
  }
});

// Load forbidden words once
const forbidden = fs.readFileSync('forbidden.txt', 'utf8')
  .split(/\r?\n/)
  .map(w => w.trim().toLowerCase())
  .filter(Boolean);

console.log('Loaded forbidden words:', forbidden.length);

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.send('OK');
});

// Handle OPTIONS request for CORS
app.options('/check', cors());

app.post('/check', upload.single('file'), async (req, res) => {
  console.log('\n=== Check Endpoint Called ===');
  console.log('Request body:', req.body);
  console.log('Request file:', req.file ? {
    fieldname: req.file.fieldname,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    path: req.file.path
  } : 'No file uploaded');
  
  if (!req.file) {
    console.error('No file uploaded');
    return res.status(400).json({ 
      message: 'Geen bestand geüpload. Zorg ervoor dat het bestand wordt geüpload met de field name "file" in multipart/form-data formaat.'
    });
  }

  try {
    console.log(`\nProcessing file: ${req.file.originalname} (${req.file.mimetype})`);
    console.log('File path:', req.file.path);
    console.log('File size:', req.file.size);

    const buffer = fs.readFileSync(req.file.path);
    let text;

    // PDF
    if (req.file.mimetype === 'application/pdf' || path.extname(req.file.originalname).toLowerCase() === '.pdf') {
      console.log('Processing as PDF');
      try {
        const data = await pdf(buffer);
        text = data.text;
        if (!text || text.trim().length === 0) {
          throw new Error('Geen tekst gevonden in PDF');
        }
        console.log('PDF text length:', text.length);
      } catch (pdfError) {
        console.error('Error processing PDF:', pdfError);
        return res.status(400).json({ 
          message: 'Fout bij verwerken PDF bestand. Controleer of het een geldig PDF document is.'
        });
      }
    }
    // DOCX
    else if (
      req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      path.extname(req.file.originalname).toLowerCase() === '.docx'
    ) {
      console.log('Processing as DOCX');
      try {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
        if (!text || text.trim().length === 0) {
          throw new Error('Geen tekst gevonden in DOCX');
        }
        console.log('DOCX text length:', text.length);
      } catch (docxError) {
        console.error('Error processing DOCX:', docxError);
        return res.status(400).json({ 
          message: 'Fout bij verwerken DOCX bestand. Controleer of het een geldig Word document is.'
        });
      }
    } else {
      console.error(`Unsupported file type: ${req.file.mimetype}`);
      return res.status(400).json({ 
        message: 'Ongeldig bestandstype. Upload een PDF of DOCX bestand.'
      });
    }

    // Split into sections
    const parts = text.split(/(\d+\.\d+\s+[^\n]+)/);
    console.log('Found sections:', parts.length);
    
    const matches = [];
    for (let i = 1; i < parts.length; i += 2) {
      const [secNum, ...titleParts] = parts[i].trim().split(' ');
      const secTitle = titleParts.join(' ');
      const secText = parts[i + 1];
      
      forbidden.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        let m;
        while ((m = regex.exec(secText)) !== null) {
          const sentMatch = secText.match(new RegExp(`([^.]*\\b${word}\\b[^.]*\\.)`, 'i'));
          const context = sentMatch ? sentMatch[1].trim() : secText.substr(m.index, 100);
          matches.push({
            section_number: secNum,
            section_title: secTitle,
            word: word,
            context: context
          });
        }
      });
    }

    console.log('Found matches:', matches.length);

    // Clean up uploaded file
    try {
      fs.unlinkSync(req.file.path);
      console.log('Cleaned up file:', req.file.path);
    } catch (cleanupError) {
      console.error('Error cleaning up file:', cleanupError);
    }

    return res.json({ matches: matches });
  } catch (err) {
    console.error('Server error:', err);
    // Clean up file in case of error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('Cleaned up file after error:', req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file after error:', cleanupError);
      }
    }
    return res.status(500).json({ 
      message: 'Interne serverfout. Probeer het later opnieuw.'
    });
  }
});

// Use the PORT environment variable provided by Render
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('\n=== Server Started ===');
  console.log(`Port: ${port}`);
  console.log('CORS: enabled for all origins');
  console.log('File size limit: 25MB');
  console.log('Upload directory: /tmp');
  console.log('Allowed file types: PDF, DOCX');
}); 