from flask import Flask, request, jsonify
from flask_cors import CORS
import fitz  # PyMuPDF
from docx import Document
import os
import logging
from werkzeug.utils import secure_filename

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Health check endpoint
@app.route('/', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "forbidden-words-checker"
    })

# Forbidden words categories
FORBIDDEN_WORDS = {
    "Assurance Wording": [
        "assure", "assurance", "assured", "assures", "assuring",
        "certify", "certified", "certifies", "certifying",
        "guarantee", "guaranteed", "guarantees", "guaranteeing",
        "validate", "validated", "validates", "validating",
        "verify", "verified", "verifies", "verifying",
        "confirm", "confirmed", "confirms", "confirming"
    ],
    "Tax Document Wording": [
        "tax", "taxes", "taxation", "taxable", "taxing",
        "fiscal", "fiscally",
        "revenue", "revenues",
        "duty", "duties",
        "levy", "levies", "levied", "levying"
    ]
}

def get_recommendation(word, category):
    recommendations = {
        "Assurance Wording": {
            "assure": "Consider using 'observed', 'noted', or 'identified' instead.",
            "certify": "Consider using 'reviewed', 'examined', or 'analyzed' instead.",
            "guarantee": "Consider using 'support', 'assist', or 'help' instead.",
            "validate": "Consider using 'observed', 'noted', or 'identified' instead.",
            "verify": "Consider using 'reviewed', 'examined', or 'analyzed' instead.",
            "confirm": "Consider using 'observed', 'noted', or 'identified' instead."
        },
        "Tax Document Wording": {
            "tax": "Consider using 'financial', 'monetary', or 'economic' instead.",
            "fiscal": "Consider using 'financial', 'monetary', or 'economic' instead.",
            "revenue": "Consider using 'income', 'earnings', or 'proceeds' instead.",
            "duty": "Consider using 'responsibility', 'obligation', or 'requirement' instead.",
            "levy": "Consider using 'impose', 'apply', or 'implement' instead."
        }
    }
    
    base_word = word.lower().rstrip('s').rstrip('d').rstrip('ing')
    return recommendations.get(category, {}).get(base_word, "Consider rephrasing to avoid this term.")

def parse_pdf(file_path):
    try:
        doc = fitz.open(file_path)
        results = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            
            # Check each category of forbidden words
            for category, words in FORBIDDEN_WORDS.items():
                matches = []
                for word in words:
                    if word.lower() in text.lower():
                        # Get context (the sentence containing the word)
                        sentences = text.split('.')
                        for sentence in sentences:
                            if word.lower() in sentence.lower():
                                matches.append({
                                    "word": word,
                                    "category": category,
                                    "context": sentence.strip(),
                                    "recommendation": get_recommendation(word, category)
                                })
                                break
                
                if matches:
                    results.append({
                        "page_number": page_num + 1,
                        "section": f"Page {page_num + 1}",
                        "matches": matches
                    })
        
        return results
    except Exception as e:
        logger.error(f"Error parsing PDF: {str(e)}")
        raise

def parse_docx(file_path):
    try:
        doc = Document(file_path)
        results = []
        current_section = "Introduction"
        
        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue
                
            # Check if this is a section header
            if para.style.name.startswith('Heading'):
                current_section = text
                continue
            
            # Check each category of forbidden words
            for category, words in FORBIDDEN_WORDS.items():
                matches = []
                for word in words:
                    if word.lower() in text.lower():
                        matches.append({
                            "word": word,
                            "category": category,
                            "context": text,
                            "recommendation": get_recommendation(word, category)
                        })
                
                if matches:
                    results.append({
                        "section": current_section,
                        "matches": matches
                    })
        
        return results
    except Exception as e:
        logger.error(f"Error parsing DOCX: {str(e)}")
        raise

@app.route('/api/parse-document', methods=['POST'])
def parse_document():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Secure the filename and create a temporary path
        filename = secure_filename(file.filename)
        file_path = os.path.join('/tmp', filename)
        file.save(file_path)
        
        try:
            # Process based on file type
            if filename.lower().endswith('.pdf'):
                results = parse_pdf(file_path)
            elif filename.lower().endswith('.docx'):
                results = parse_docx(file_path)
            else:
                return jsonify({"error": "Unsupported file type. Please upload a PDF or DOCX file."}), 400
            
            # Clean up the temporary file
            os.remove(file_path)
            
            if not results:
                return jsonify({
                    "message": "No forbidden words were detected in the uploaded document."
                })
            
            return jsonify({"results": results})
            
        except Exception as e:
            logger.error(f"Error processing file: {str(e)}")
            return jsonify({"error": f"An error occurred while processing the file: {str(e)}"}), 500
            
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({"error": "An unexpected error occurred"}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port) 