# Forbidden Words Checker

A Streamlit application that checks uploaded PDF documents for forbidden words and provides suggestions for improvement.

## Features

- PDF document upload and analysis
- Forbidden words detection in Dutch and English
- Section-based analysis with context
- AI-powered suggestions for improvement
- Real-time feedback

## Local Development

1. Clone the repository
2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file with:
   ```
   OPENAI_API_KEY=your-api-key
   API_BASE_URL=https://forbidden-words-checker-2.onrender.com
   ```
5. Run the app:
   ```bash
   streamlit run app.py
   ```

## Render Deployment

The app is automatically deployed to Render when changes are pushed to the main branch.

### Environment Variables

In your Render dashboard for this service, under **Environment** → **Environment Variables**, add:
```
OPENAI_API_KEY=your-secret-key
API_BASE_URL=https://forbidden-words-checker-2.onrender.com
```

No other setup is required—Render injects these values into the environment at runtime.

## Usage

1. Upload a PDF document using the file uploader
2. The app will analyze the document for forbidden words
3. For each match found, you'll see:
   - The page number and section
   - The forbidden word in context
   - An explanation of why it's problematic
   - A suggested improvement

## License

MIT 