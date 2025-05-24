require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();

// Enable CORS
app.use(cors());

// Configure multer voor bestandsupload
const upload = multer({
  storage: multer.diskStorage({
    destination: '/tmp',
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

// Laad verboden woorden
const forbidden = fs.readFileSync('forbidden.txt', 'utf8')
  .split(/\r?\n/)
  .map(w => w.trim().toLowerCase())
  .filter(Boolean);

// Health check
app.get('/health', (req, res) => res.send('OK'));

// Check endpoint
app.post('/check', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Geen bestand geüpload' });
    }

    // Lees bestand
    const buffer = fs.readFileSync(req.file.path);
    let text;

    // Verwerk PDF of DOCX
    if (req.file.mimetype === 'application/pdf') {
      const data = await pdf(buffer);
      text = data.text;
    } else {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    }

    // Zoek verboden woorden
    const matches = [];
    forbidden.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      let m;
      while ((m = regex.exec(text)) !== null) {
        const context = text.substring(Math.max(0, m.index - 50), Math.min(text.length, m.index + 50));
        matches.push({
          word: word,
          context: context
        });
      }
    });

    // Cleanup
    fs.unlinkSync(req.file.path);

    res.json({ matches });
  } catch (err) {
    console.error(err);
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ message: 'Fout bij verwerken bestand' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server draait op poort ${port}`)); 