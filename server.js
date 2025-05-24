require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const multer = require('multer');

const app = express();

// Enable CORS
app.use(cors());

// Configure multer for file uploads
const upload = multer({
  dest: '/tmp/',
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
    // Check voor bestand
    if (!req.file) {
      console.log('Geen bestand ontvangen');
      return res.status(400).json({ 
        message: 'Geen bestand geüpload',
        details: 'Upload een PDF of DOCX bestand via multipart/form-data met veldnaam "file".'
      });
    }

    console.log('Bestand ontvangen:', req.file.originalname);
    console.log('Bestandsgrootte:', req.file.size, 'bytes');

    // Lees het bestand
    const buffer = fs.readFileSync(req.file.path);
    const ext = path.extname(req.file.originalname).toLowerCase();

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

    // Verwijder het bestand
    fs.unlinkSync(req.file.path);

    res.json({ 
      message: 'Document gecontroleerd',
      filename: req.file.originalname,
      type: ext === '.pdf' ? 'PDF' : 'DOCX',
      matches: matches
    });
  } catch (err) {
    console.error('Server error:', err);
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