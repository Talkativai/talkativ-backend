import Tesseract from 'tesseract.js';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// ─── Extract text from image file (PNG/JPG) using Tesseract.js ───────────────
export const extractTextFromImage = async (filePath: string): Promise<string> => {
  const { data: { text } } = await Tesseract.recognize(filePath, 'eng', { logger: () => {} });
  return text.trim();
};

// ─── Extract text from PDF using pdf-parse ───────────────────────────────────
// Works for text-based PDFs (covers most restaurant menus).
// For scanned/image-only PDFs, ask users to upload as PNG instead.
export const extractTextFromPdf = async (filePath: string): Promise<string> => {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text.trim();
};

// ─── Extract text from DOCX using mammoth ───────────────────────────────────
export const extractTextFromDocx = async (filePath: string): Promise<string> => {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
};
