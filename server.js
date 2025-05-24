require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const pdf = require('pdf-parse');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
const upload = multer({ dest: '/tmp' });

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY environment variable is not set');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Load forbidden list once
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
    const data = await pdf(buffer);
    const text = data.text;
    const matches = [];

    // Simple section split (e.g. "1.2 Section Title")
    const parts = text.split(/(\d+\.\d+\s+[^\n]+)/);
    for (let i = 1; i < parts.length; i += 2) {
      const [secNum, ...titleParts] = parts[i].trim().split(' ');
      const secTitle = titleParts.join(' ');
      const secText = parts[i + 1];

      forbidden.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        let match;
        while ((match = regex.exec(secText)) !== null) {
          // extract sentence
          const sentMatch = secText.match(new RegExp(`([^.]*\\b${word}\\b[^.]*\\.)`, 'i'));
          const context = sentMatch ? sentMatch[1].trim() : secText.substr(match.index, 100);
          matches.push({ section_number: secNum, section_title: secTitle, word, context });
        }
      });
    }

    // For each match, ask OpenAI for explanation & suggestion
    const detailed = [];
    for (const m of matches) {
      const prompt = `
In the following fragment from a pentest report, the word "${m.word}" is forbidden:
"${m.context}"
Explain briefly why this is wrong, and give an improved phrasing.
`;
      const resp = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150
      });
      const reply = resp.choices[0].message.content.trim().split(/\r?\n/);
      detailed.push({
        page: null, // PDF-parse doesn't track pages
        section_number: m.section_number,
        section_title: m.section_title,
        word: m.word,
        context: m.context,
        explanation: reply[0] || '',
        suggestion: reply.slice(-1)[0] || ''
      });
    }

    res.json({ matches: detailed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on ${port}`)); 