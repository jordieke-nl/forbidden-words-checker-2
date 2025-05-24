require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const multer = require('multer');
const os = require('os');

const app = express();

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json({ limit: '25mb' }));

// Configure multer for file uploads
const upload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB
  },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.pdf', '.docx'].includes(ext)) {
      return cb(new Error('Alleen PDF en DOCX bestanden zijn toegestaan'));
    }
    cb(null, true);
  }
});

// Logging middleware
app.use((req, res, next) => {
  console.log('\n=== NIEUWE REQUEST ===');
  console.log('Tijd:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  if (req.headers['content-type']?.includes('application/json')) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Laad verboden woorden
const forbidden = fs.readFileSync('forbidden.txt', 'utf8')
  .split(/\r?\n/)
  .map(w => w.trim().toLowerCase())
  .filter(Boolean);

console.log('Aantal verboden woorden geladen:', forbidden.length);

// Health check
app.get('/health', (req, res) => res.send('OK'));

// Check endpoint
app.post('/check', upload.single('file'), async (req, res) => {
  console.log('\n=== CHECK ENDPOINT AANGEROEPEN ===');
  console.log('Content-Type:', req.headers['content-type']);
  
  try {
    let buffer, filename;

    if (req.file) {
      // Multipart form-data upload
      console.log('Multipart upload ontvangen');
      buffer = fs.readFileSync(req.file.path);
      filename = req.file.originalname;
      console.log('Bestand ontvangen:', filename);
      console.log('Bestandsgrootte:', buffer.length, 'bytes');
    } else if (req.body.file && req.body.filename) {
      // JSON upload met base64
      console.log('JSON upload ontvangen');
      try {
        let base64Data = req.body.file;
        // Verwijder data URL prefix als die er is
        if (base64Data.startsWith('data:')) {
          base64Data = base64Data.split(',')[1];
        }
        buffer = Buffer.from(base64Data, 'base64');
        filename = req.body.filename;
        console.log('Bestand ontvangen:', filename);
        console.log('Bestandsgrootte:', buffer.length, 'bytes');
      } catch (e) {
        console.error('Base64 decode error:', e);
        return res.status(400).json({
          message: 'Ongeldig bestand',
          details: 'Het bestand kon niet worden gedecodeerd. Controleer of het correct is gecodeerd.'
        });
      }
    } else {
      console.log('Geen bestand ontvangen');
      return res.status(400).json({
        message: 'Geen bestand geüpload',
        details: 'Upload een PDF of DOCX bestand via multipart/form-data met veldnaam "file" of via JSON met base64 en filename.'
      });
    }

    // Check bestandstype
    const ext = path.extname(filename).toLowerCase();
    if (!['.pdf', '.docx'].includes(ext)) {
      console.log('Ongeldig bestandstype:', ext);
      return res.status(400).json({
        message: 'Ongeldig bestandstype',
        details: 'Alleen PDF en DOCX bestanden zijn toegestaan.'
      });
    }

    // Sla het bestand tijdelijk op voor verwerking
    const tempPath = path.join(os.tmpdir(), Date.now() + ext);
    fs.writeFileSync(tempPath, buffer);

    // Verwerk PDF of DOCX
    let text;
    if (ext === '.pdf') {
      console.log('PDF verwerken');
      const data = await pdf(buffer);
      text = data.text;
    } else {
      console.log('DOCX verwerken');
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    }

    // Zoek verboden woorden
    const matches = [];
    forbidden.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        const start = Math.max(0, match.index - 50);
        const end = Math.min(text.length, match.index + 50);
        matches.push({
          forbidden_word: word,
          context: text.substring(start, end),
          recommendation: `Vervang "${word}" door een geschikter woord.`,
          explanation: `Het woord "${word}" is niet toegestaan in deze context.`
        });
      }
    });

    console.log('Aantal matches gevonden:', matches.length);

    // Verwijder het tijdelijke bestand
    try {
      fs.unlinkSync(tempPath);
      if (req.file?.path) {
        fs.unlinkSync(req.file.path);
      }
    } catch (e) {
      console.error('Fout bij verwijderen tijdelijk bestand:', e);
    }

    res.json({
      message: 'Document gecontroleerd',
      filename: filename,
      type: ext === '.pdf' ? 'PDF' : 'DOCX',
      matches: matches
    });
  } catch (err) {
    console.error('Server error:', err);
    // Probeer tijdelijke bestanden op te ruimen
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({
      message: 'Fout bij verwerken document',
      details: err.message
    });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log('\n=== SERVER GESTART ===');
  console.log(`Port: ${port}`);
  console.log('CORS: enabled');
  console.log('Bestandslimiet: 25MB');
  console.log('Upload directory: /tmp');
  console.log('Toegestane bestandstypen: .pdf, .docx');
}); 