const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class TextExtractor {
  constructor() {
    this.supportedMimeTypes = {
      'application/pdf': this._extractFromPdf.bind(this),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': this._extractFromDocx.bind(this),
      'text/plain': this._extractFromTxt.bind(this)
    };
  }

  async extract(filePath, mimeType) {
    if (!this.supportedMimeTypes[mimeType]) {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    try {
      return await this.supportedMimeTypes[mimeType](filePath);
    } catch (error) {
      logger.error(`Error extracting text from ${filePath}: ${error.message}`);
      throw error;
    }
  }

  async _extractFromPdf(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer, {
        max: 0, // No page limit
        version: 'v2.0.550'
      });

      return {
        text: data.text,
        pages: data.numpages,
        metadata: {
          title: data.info?.Title || path.basename(filePath),
          author: data.info?.Author,
          creationDate: data.info?.CreationDate
        }
      };
    } catch (error) {
      if (error.message.includes('Invalid PDF structure')) {
        throw new Error('The PDF file appears to be corrupted or encrypted');
      }
      throw error;
    }
  }

  async _extractFromDocx(filePath) {
    try {
      const result = await mammoth.extractRawText({
        path: filePath
      });

      // Extract page numbers from the text
      const pages = this._extractPagesFromDocx(result.value);

      return {
        text: result.value,
        pages: pages.length,
        metadata: {
          title: path.basename(filePath),
          warnings: result.messages
        }
      };
    } catch (error) {
      if (error.message.includes('Invalid file format')) {
        throw new Error('The DOCX file appears to be corrupted');
      }
      throw error;
    }
  }

  async _extractFromTxt(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // Detect and handle BOM
      const text = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;

      return {
        text,
        pages: 1,
        metadata: {
          title: path.basename(filePath),
          encoding: 'UTF-8'
        }
      };
    } catch (error) {
      throw new Error(`Error reading text file: ${error.message}`);
    }
  }

  _extractPagesFromDocx(text) {
    // Simple page detection based on common page break indicators
    const pageBreaks = text.split(/\f|\n\s*\n/);
    return pageBreaks.filter(page => page.trim().length > 0);
  }

  isSupportedMimeType(mimeType) {
    return !!this.supportedMimeTypes[mimeType];
  }

  getSupportedMimeTypes() {
    return Object.keys(this.supportedMimeTypes);
  }
}

module.exports = new TextExtractor(); 