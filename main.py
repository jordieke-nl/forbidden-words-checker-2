from flask import Flask, request, jsonify
from flask_cors import CORS
import fitz  # PyMuPDF
import docx
import os
import re
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

# Forbidden words organized by category
FORBIDDEN_WORDS = {
    "Assurance Wording": [
        "guarantee", "insure", "assure", "ensure", "warrant",
        "attest", "verify", "certify", "validate"
    ],
    "Conclusion Language": [
        "we conclude", "we are of the opinion", "in our opinion",
        "we find", "we found", "we have determined", "we believe",
        "you comply with"
    ],
    "Negative Assurance": [
        "nothing has come to our attention that causes us to believe",
        "nothing we reviewed indicated",
        "based on the procedures we performed, we have no reason to believe that"
    ],
    "Technical Terms": [
        "audit", "review", "compile"
    ],
    "Absolutes": [
        "always", "never", "all", "none", "complete", "entire"
    ]
}

def get_recommendation(word, category):
    recommendations = {
        "Assurance Wording": "Consider using 'observed', 'noted', or 'identified' instead.",
        "Conclusion Language": "Consider using 'we observed' or 'we noted' instead.",
        "Negative Assurance": "Consider using 'based on our observations' or 'in our analysis' instead.",
        "Technical Terms": "Consider using 'assessment', 'analysis', or 'evaluation' instead.",
        "Absolutes": "Consider using more specific and qualified language."
    }
    return recommendations.get(category, "Consider rephrasing to be more specific and qualified.")

def check_forbidden_words(text):
    matches = []
    for category, words in FORBIDDEN_WORDS.items():
        for word in words:
            # Use word boundaries to avoid partial matches
            pattern = r'\b' + re.escape(word) + r'\b'
            for match in re.finditer(pattern, text.lower()):
                start = max(0, match.start() - 50)
                end = min(len(text), match.end() + 50)
                context = text[start:end].strip()
                matches.append({
                    "word": word,
                    "category": category,
                    "context": context,
                    "recommendation": get_recommendation(word, category)
                })
    return matches

def parse_pdf(file_path):
    results = []
    doc = fitz.open(file_path)
    for page in doc:
        page_text = page.get_text()
        matches = check_forbidden_words(page_text)
        if matches:
            results.append({
                "page_number": page.number + 1,
                "matches": matches
            })
    return results

def parse_docx(file_path):
    results = []
    doc = docx.Document(file_path)
    current_page = 1
    current_section = "Full Document"
    page_text = ""
    
    for para in doc.paragraphs:
        if para.style.name.startswith('Heading'):
            current_section = para.text
        page_text += para.text + "\n"
        
        # Simple heuristic: assume ~500 words per page
        if len(page_text.split()) > 500:
            matches = check_forbidden_words(page_text)
            if matches:
                results.append({
                    "page_number": current_page,
                    "section": current_section,
                    "matches": matches
                })
            current_page += 1
            page_text = ""
    
    # Check remaining text
    if page_text:
        matches = check_forbidden_words(page_text)
        if matches:
            results.append({
                "page_number": current_page,
                "section": current_section,
                "matches": matches
            })
    
    return results

@app.route("/api/parse-document", methods=["POST"])
def parse_document():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    
    filename = secure_filename(file.filename)
    file_path = os.path.join("/tmp", filename)
    file.save(file_path)
    
    try:
        if filename.lower().endswith(".pdf"):
            results = parse_pdf(file_path)
        elif filename.lower().endswith(".docx"):
            results = parse_docx(file_path)
        else:
            return jsonify({"error": "Unsupported file type. Please upload a PDF or DOCX file."}), 400
        
        if not results:
            return jsonify({"message": "No forbidden words were detected in the uploaded document."})
        
        return jsonify({"results": results})
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

if __name__ == "__main__":
    app.run(debug=False) 