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

// Parse JSON bodies with increased limit for base64 files
app.use(express.json({ limit: '25mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log('\n=== New Request ===');
  console.log('Time:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  if (req.headers['content-type']?.includes('application/json')) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
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

// Helper function to process file content
async function processFileContent(buffer, filename, mimetype) {
  console.log(`\nProcessing file: ${filename} (${mimetype})`);
  let text;

  // PDF
  if (mimetype === 'application/pdf' || path.extname(filename).toLowerCase() === '.pdf') {
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
      throw new Error('Fout bij verwerken PDF bestand. Controleer of het een geldig PDF document is.');
    }
  }
  // DOCX
  else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    path.extname(filename).toLowerCase() === '.docx'
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
      throw new Error('Fout bij verwerken DOCX bestand. Controleer of het een geldig Word document is.');
    }
  } else {
    throw new Error('Ongeldig bestandstype. Upload een PDF of DOCX bestand.');
  }

  return text;
}

// Helper function to find matches
function findMatches(text) {
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

  return matches;
}

// Handle both multipart and JSON uploads
app.post('/check', upload.single('file'), async (req, res) => {
  console.log('\n=== Check Endpoint Called ===');
  
  try {
    let buffer;
    let filename;
    let mimetype;

    // Handle multipart/form-data upload
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      if (!req.file) {
        throw new Error('Geen bestand geüpload. Zorg ervoor dat het bestand wordt geüpload met de field name "file" in multipart/form-data formaat.');
      }
      buffer = fs.readFileSync(req.file.path);
      filename = req.file.originalname;
      mimetype = req.file.mimetype;
    }
    // Handle JSON upload with base64
    else if (req.headers['content-type']?.includes('application/json')) {
      if (!req.body.file || !req.body.filename) {
        throw new Error('Geen bestand geüpload. Stuur een base64-gecodeerd bestand met filename in JSON formaat.');
      }
      try {
        buffer = Buffer.from(req.body.file, 'base64');
      } catch (e) {
        throw new Error('Ongeldige base64 encoding van het bestand.');
      }
      filename = req.body.filename;
      mimetype = req.body.mimetype || 'application/octet-stream';
    }
    else {
      throw new Error('Ongeldig content type. Gebruik multipart/form-data of application/json met base64.');
    }

    // Validate file size
    if (buffer.length > 25 * 1024 * 1024) {
      throw new Error('Bestand is te groot. Maximum grootte is 25MB.');
    }

    const text = await processFileContent(buffer, filename, mimetype);
    const matches = findMatches(text);

    console.log('Found matches:', matches.length);

    // Clean up if it was a multipart upload
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('Cleaned up file:', req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }

    return res.json({ matches: matches });
  } catch (err) {
    console.error('Server error:', err);
    // Clean up if it was a multipart upload
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('Cleaned up file after error:', req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file after error:', cleanupError);
      }
    }
    return res.status(400).json({ 
      message: err.message || 'Interne serverfout. Probeer het later opnieuw.'
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
  console.log('Supported upload methods: multipart/form-data, application/json (base64)');
}); 