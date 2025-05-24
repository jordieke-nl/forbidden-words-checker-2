# Forbidden Words Checker API

A Node.js/Express API for detecting forbidden words in uploaded documents, with ChatGPT integration.

## Features

- File upload and processing (PDF, DOCX, TXT)
- Forbidden words detection in Dutch and English
- ChatGPT webhook integration
- Detailed violation reporting with context and recommendations
- Health monitoring and logging

## Prerequisites

- Node.js 18.x
- npm or yarn
- OpenAI API key (for ChatGPT integration)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/forbidden-words-checker-2.git
cd forbidden-words-checker-2
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
PORT=3000
NODE_ENV=development
OPENAI_API_KEY=your_openai_api_key_here
API_SECRET_KEY=your_secret_key_for_auth
MAX_FILE_SIZE=10485760
ALLOWED_ORIGINS=https://chat.openai.com,https://chatgpt.com
BASE_URL=http://localhost:3000
```

## Running the Application

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### File Upload
```
POST /api/upload
Content-Type: multipart/form-data
```

### Health Check
```
GET /api/health
```

### ChatGPT Webhook
```
POST /api/webhook
Content-Type: multipart/form-data
```

### Supported File Types
```
GET /api/upload/supported-types
```

## Response Format

```json
{
  "status": "success",
  "document": "filename.pdf",
  "total_violations": 3,
  "violations": [
    {
      "word": "garanderen",
      "page": 5,
      "context": "Wij garanderen dat de implementatie...",
      "recommendation": "Use 'verwachten' or 'streven naar' instead",
      "explanation": "Guarantee terms create assurance impression",
      "category": "assurance",
      "language": "dutch"
    }
  ]
}
```

## Forbidden Words Categories

### Dutch
- **Assurance terms**: garanderen, verzekeren, waarborgen, verklaren, bevestigen, certificeren, valideren
- **Conclusions**: wij concluderen, wij zijn van oordeel dat, wij vinden dat, wij hebben vastgesteld dat, wij geloven, u heeft...nageleefd
- **Negative assurance**: ons is niets gebleken op grond waarvan wij zouden moeten concluderen dat, niets dat wij hebben gereviewd geeft een indicatie dat, gebaseerd op onze werkzaamheden hebben wij geen reden om aan te nemen dat
- **Technical terms**: controle, beoordeling, samenstellen
- **Absolutes**: altijd, nooit, alle, geen, complete, geheel

### English
- **Assurance terms**: guarantee, insure, assure, ensure, warrant, attest, verify, certify, validate
- **Conclusions**: we conclude, we are of the opinion, in our opinion, we find, we found, we have determined, we believe, you comply with
- **Negative assurance**: nothing has come to our attention that causes us to believe, nothing we reviewed indicated, based on the procedures we performed we have no reason to believe that
- **Technical terms**: audit, review, compile
- **Absolutes**: always, never, all, none, complete, entire

## ChatGPT Integration

To integrate with ChatGPT:

1. Set up your OpenAI API key in the `.env` file
2. Use the webhook endpoint at `/api/webhook`
3. Send files using multipart/form-data
4. Process the JSON response in your ChatGPT agent

Example ChatGPT integration code:
```javascript
const formData = new FormData();
formData.append('file', uploadedFile);

const response = await fetch('https://your-api-url/api/webhook', {
  method: 'POST',
  body: formData,
  headers: {
    'Authorization': 'Bearer your-api-key'
  }
});

const result = await response.json();
```

## Deployment

The application is configured for deployment on Render. The `render.yaml` file contains the necessary configuration.

## Error Handling

The API uses a comprehensive error handling system that:
- Validates file types and sizes
- Handles corrupted files
- Provides detailed error messages
- Logs errors for debugging

## Logging

Logs are stored in the `logs` directory:
- `error.log`: Error-level logs
- `combined.log`: All logs

## Security

- Rate limiting: 100 requests per hour per IP
- File size limit: 10MB
- Supported file types validation
- CORS configuration
- Helmet security headers

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT 