require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
const upload = multer({ dest: '/tmp' });

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY environment variable is not set');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Load forbidden words once
const forbidden = fs.readFileSync('forbidden.txt', 'utf8')
  .split(/\r?\n/)
  .map(w => w.trim().toLowerCase())
  .filter(Boolean);

/**
 * POST /check
 * multipart/form-data: file (PDF)
 */
app.post('/check', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  try {
    const buffer = fs.readFileSync(req.file.path);
    let text;
    // PDF
    if (req.file.mimetype === 'application/pdf') {
      const data = await pdf(buffer);
      text = data.text;
    }
    // DOCX
    else if (
      req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      req.file.originalname.toLowerCase().endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      return res.status(400).json({ message: 'Unsupported file type. Please upload PDF or DOCX.' });
    }

    // Split into sections
    const parts = text.split(/(\d+\.\d+\s+[^\n]+)/);
    const rawMatches = [];
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
          rawMatches.push({ page: null, section_number: secNum, section_title: secTitle, word, context });
        }
      });
    }

    // Enrich with GPT advice
    const detailed = [];
    for (const m of rawMatches) {
      const prompt = `
In this fragment, the forbidden word "${m.word}" appears:
"${m.context}"
Explain briefly why it's wrong and suggest an improved phrasing.
`;
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150
      });
      const lines = resp.choices[0].message.content.trim().split(/\r?\n/);
      detailed.push({
        page: m.page,
        section_number: m.section_number,
        section_title: m.section_title,
        word: m.word,
        context: m.context,
        explanation: lines[0] || '',
        suggestion: lines.slice(-1)[0] || ''
      });
    }

    return res.json({ matches: detailed });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on port ${port}`)); 