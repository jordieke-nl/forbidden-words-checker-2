require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
app.use(cors());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: '/tmp',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const allowedExtensions = ['.pdf', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Ongeldig bestandstype. Upload een PDF of DOCX bestand.'));
    }
  },
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB limit voor grote pentest rapporten
  }
});

// Load forbidden words once
const forbidden = fs.readFileSync('forbidden.txt', 'utf8')
  .split(/\r?\n/)
  .map(w => w.trim().toLowerCase())
  .filter(Boolean);

// Health check endpoint
app.get('/health', (req, res) => {
  res.send('OK');
});

app.post('/check', upload.single('file'), async (req, res) => {
  if (!req.file) {
    console.error('Geen bestand geüpload');
    return res.status(400).json({ message: 'Geen bestand geüpload' });
  }

  try {
    console.log(`Verwerken van bestand: ${req.file.originalname} (${req.file.mimetype})`);
    const buffer = fs.readFileSync(req.file.path);
    let text;

    // PDF
    if (req.file.mimetype === 'application/pdf' || path.extname(req.file.originalname).toLowerCase() === '.pdf') {
      console.log('Verwerken als PDF');
      try {
        const data = await pdf(buffer);
        text = data.text;
        if (!text || text.trim().length === 0) {
          throw new Error('Geen tekst gevonden in PDF');
        }
      } catch (pdfError) {
        console.error('Fout bij verwerken PDF:', pdfError);
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
      console.log('Verwerken als DOCX');
      try {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
        if (!text || text.trim().length === 0) {
          throw new Error('Geen tekst gevonden in DOCX');
        }
      } catch (docxError) {
        console.error('Fout bij verwerken DOCX:', docxError);
        return res.status(400).json({ 
          message: 'Fout bij verwerken DOCX bestand. Controleer of het een geldig Word document is.'
        });
      }
    } else {
      console.error(`Ongeldig bestandstype: ${req.file.mimetype}`);
      return res.status(400).json({ 
        message: 'Ongeldig bestandstype. Upload een PDF of DOCX bestand.'
      });
    }

    // Split into sections
    const parts = text.split(/(\d+\.\d+\s+[^\n]+)/);
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

    // Clean up uploaded file
    try {
      fs.unlinkSync(req.file.path);
    } catch (cleanupError) {
      console.error('Fout bij opruimen bestand:', cleanupError);
    }

    return res.json({ matches: matches });
  } catch (err) {
    console.error('Server fout:', err);
    // Clean up file in case of error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Fout bij opruimen bestand na error:', cleanupError);
      }
    }
    return res.status(500).json({ 
      message: 'Interne serverfout. Probeer het later opnieuw.'
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server luistert op poort ${port}`)); 