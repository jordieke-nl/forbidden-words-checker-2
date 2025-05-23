# Forbidden Words Checker

A Flask-based API that checks uploaded documents (PDF or DOCX) for forbidden words commonly found in pentest reports and advisory documents.

## Features

- Supports PDF and DOCX file formats
- Checks for exact matches of forbidden words
- Provides context and recommendations for each match
- Categorizes forbidden words by type
- Returns structured results with page numbers and sections

## API Usage

Send a POST request to `/api/parse-document` with a multipart form field called `file` containing the document to check.

Example using curl:
```bash
curl -X POST -F "file=@your_document.pdf" https://forbidden-words-checker-2.onrender.com/api/parse-document
```

## Response Format

The API returns a JSON response with the following structure:

```json
{
    "results": [
        {
            "page_number": 1,
            "section": "Executive Summary",
            "matches": [
                {
                    "word": "validate",
                    "category": "Assurance Wording",
                    "context": "We validate that the findings are correct.",
                    "recommendation": "Consider using 'observed', 'noted', or 'identified' instead."
                }
            ]
        }
    ]
}
```

If no forbidden words are found:
```json
{
    "message": "No forbidden words were detected in the uploaded document."
}
```

## Forbidden Words Categories

1. Assurance Wording
2. Conclusion Language
3. Negative Assurance
4. Technical Terms
5. Absolutes

## Deployment

The application is deployed on Render. To deploy locally:

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the application:
```bash
python main.py
```

## Security Notes

- Files are temporarily stored in `/tmp` and automatically deleted after processing
- Only PDF and DOCX files are accepted
- Filenames are sanitized before processing 