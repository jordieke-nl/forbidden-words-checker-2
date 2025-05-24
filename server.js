require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json({ limit: '25mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log('\n=== NIEUWE REQUEST ===');
  console.log('Tijd:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  if (req.headers['content-type']?.includes('application/json')) {
    console.log('Body keys:', Object.keys(req.body));
    console.log('Filename:', req.body.filename);
    console.log('File size:', req.body.file ? req.body.file.length : 0);
  }
  next();
});

// Laad verboden woorden
const forbidden = fs.readFileSync('forbidden.txt', 'utf8')
  .split(/\r?\n/)
  .map(w => w.trim().toLowerCase())
  .filter(Boolean);

console.log('Aantal verboden woorden geladen:', forbidden.length);

// Split text into sections
function splitIntoSections(text) {
  // Split on common section markers
  const sectionRegex = /(?:\n|\r\n?)(?:\d+\.\s*[A-Z][^\n\r]+|\n[A-Z][^\n\r]+(?:\n|$))/g;
  const sections = [];
  let match;
  let lastIndex = 0;
  let sectionNumber = 1;

  while ((match = sectionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      sections.push({
        number: sectionNumber,
        title: 'Introduction',
        content: text.substring(lastIndex, match.index).trim()
      });
      sectionNumber++;
    }
    sections.push({
      number: sectionNumber,
      title: match[0].trim(),
      content: text.substring(match.index + match[0].length, text.length).trim()
    });
    sectionNumber++;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    sections.push({
      number: sectionNumber,
      title: 'Conclusion',
      content: text.substring(lastIndex).trim()
    });
  }

  return sections;
}

// Health check
app.get('/health', (req, res) => res.send('OK'));

// Check endpoint
app.post('/check', async (req, res) => {
  console.log('\n=== CHECK ENDPOINT AANGEROEPEN ===');
  console.log('Content-Type:', req.headers['content-type']);
  
  try {
    // Check voor base64 bestand
    if (!req.body.file || !req.body.filename) {
      console.log('Geen bestand of filename in request');
      return res.status(400).json({ message: 'Geen bestand geüpload' });
    }

    console.log('Bestand ontvangen:', req.body.filename);
    console.log('Base64 lengte:', req.body.file.length);

    // Valideer base64 string
    if (req.body.file.length < 100) {
      console.log('Base64 string te kort:', req.body.file);
      return res.status(400).json({ 
        message: 'Ongeldige base64 string. Het bestand is te klein of niet correct gecodeerd.',
        details: 'De Custom GPT moet het bestand correct omzetten naar base64 voordat het wordt verstuurd.'
      });
    }

    // Check bestandstype
    const ext = path.extname(req.body.filename).toLowerCase();
    if (!['.pdf', '.docx'].includes(ext)) {
      console.log('Ongeldig bestandstype:', ext);
      return res.status(400).json({ message: 'Alleen PDF en DOCX bestanden zijn toegestaan' });
    }

    // Sla het bestand tijdelijk op
    const tempPath = path.join('/tmp', Date.now() + ext);
    let buffer;
    try {
      buffer = Buffer.from(req.body.file, 'base64');
      console.log('Base64 decode succesvol');
    } catch (e) {
      console.error('Base64 decode error:', e);
      return res.status(400).json({ 
        message: 'Ongeldige base64 string',
        details: 'De base64 string kon niet worden gedecodeerd. Controleer of het bestand correct is gecodeerd.'
      });
    }

    if (buffer.length < 100) {
      console.log('Decoded bestand te klein:', buffer.length, 'bytes');
      return res.status(400).json({ 
        message: 'Bestand te klein',
        details: 'Het gedecodeerde bestand is te klein om een geldig document te zijn.'
      });
    }

    fs.writeFileSync(tempPath, buffer);
    console.log('Bestand opgeslagen als:', tempPath);
    console.log('Bestandsgrootte:', buffer.length, 'bytes');

    // Verwerk PDF of DOCX
    let text;
    if (ext === '.pdf') {
      console.log('PDF verwerken');
      const data = await pdf(buffer);
      text = data.text;
      console.log('PDF tekst lengte:', text.length);
    } else {
      console.log('DOCX verwerken');
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
      console.log('DOCX tekst lengte:', text.length);
    }

    // Split into sections
    const sections = splitIntoSections(text);
    console.log('Aantal secties gevonden:', sections.length);

    // Zoek verboden woorden per sectie
    const matches = [];
    sections.forEach(section => {
      forbidden.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        let m;
        while ((m = regex.exec(section.content)) !== null) {
          const context = section.content.substring(
            Math.max(0, m.index - 50),
            Math.min(section.content.length, m.index + 50)
          );
          matches.push({
            section_number: section.number,
            section_title: section.title,
            forbidden_word: word,
            context: context,
            recommendation: `Consider replacing "${word}" with a more appropriate term.`,
            explanation: `The word "${word}" is considered inappropriate in this context and should be avoided in professional documentation.`
          });
        }
      });
    });

    console.log('Aantal matches gevonden:', matches.length);

    // Verwijder het bestand weer
    fs.unlinkSync(tempPath);
    console.log('Bestand verwijderd:', tempPath);

    res.json({ 
      message: 'Document analysis complete',
      filename: req.body.filename,
      type: ext === '.pdf' ? 'PDF' : 'DOCX',
      total_sections: sections.length,
      matches: matches
    });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ 
      message: 'Error processing document',
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