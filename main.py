from flask import Flask, request, jsonify
from flask_cors import CORS
import fitz  # PyMuPDF
from docx import Document
import os
import logging
from werkzeug.utils import secure_filename
import tempfile
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
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
        logger.info(f"Parsing PDF file: {file_path}")
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
        
        logger.info(f"Found {len(results)} results in PDF")
        return results
    except Exception as e:
        logger.error(f"Error parsing PDF: {str(e)}\n{traceback.format_exc()}")
        raise

def parse_docx(file_path):
    try:
        logger.info(f"Parsing DOCX file: {file_path}")
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
        
        logger.info(f"Found {len(results)} results in DOCX")
        return results
    except Exception as e:
        logger.error(f"Error parsing DOCX: {str(e)}\n{traceback.format_exc()}")
        raise

@app.route('/api/parse-document', methods=['POST'])
def parse_document():
    temp_file = None
    try:
        logger.info("Received document parse request")
        
        if 'file' not in request.files:
            logger.error("No file in request")
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        if file.filename == '':
            logger.error("Empty filename")
            return jsonify({"error": "No file selected"}), 400
        
        logger.info(f"Processing file: {file.filename}")
        
        # Create a temporary file with a proper extension
        temp_dir = tempfile.gettempdir()
        filename = secure_filename(file.filename)
        temp_file = os.path.join(temp_dir, filename)
        
        try:
            file.save(temp_file)
            logger.info(f"File saved to: {temp_file}")
            
            # Process based on file type
            if filename.lower().endswith('.pdf'):
                results = parse_pdf(temp_file)
            elif filename.lower().endswith('.docx'):
                results = parse_docx(temp_file)
            else:
                logger.error(f"Unsupported file type: {filename}")
                return jsonify({"error": "Unsupported file type. Please upload a PDF or DOCX file."}), 400
            
            if not results:
                logger.info("No forbidden words found")
                return jsonify({
                    "message": "No forbidden words were detected in the uploaded document."
                })
            
            logger.info(f"Returning {len(results)} results")
            return jsonify({"results": results})
            
        except Exception as e:
            logger.error(f"Error processing file: {str(e)}\n{traceback.format_exc()}")
            return jsonify({"error": f"An error occurred while processing the file: {str(e)}"}), 500
            
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": "An unexpected error occurred"}), 500
        
    finally:
        # Clean up the temporary file
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
                logger.info("Temporary file removed")
            except Exception as e:
                logger.error(f"Error removing temporary file: {str(e)}")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port) 