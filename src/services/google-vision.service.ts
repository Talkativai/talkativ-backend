import { env } from '../config/env.js';
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

// ─── Extract text from image file (PNG/JPG) ─────────────────────────────────
export const extractTextFromImage = async (filePath: string): Promise<string> => {
  const imageBuffer = fs.readFileSync(filePath);
  const base64Image = imageBuffer.toString('base64');

  const requestBody = {
    requests: [
      {
        image: { content: base64Image },
        features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
      },
    ],
  };

  const res = await fetch(`${VISION_API_URL}?key=${env.GOOGLE_VISION_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Google Vision API error: ${error}`);
  }

  const data = await res.json() as any;
  const annotations = data.responses?.[0]?.textAnnotations;

  if (!annotations || annotations.length === 0) {
    return '';
  }

  // First annotation contains the full text
  return annotations[0].description || '';
};

// ─── Extract text from PDF using Vision API ─────────────────────────────────
export const extractTextFromPdf = async (filePath: string): Promise<string> => {
  // For PDFs, we convert each page to an image-like request
  // Vision API supports PDF via DOCUMENT_TEXT_DETECTION with inputConfig
  const pdfBuffer = fs.readFileSync(filePath);
  const base64Pdf = pdfBuffer.toString('base64');

  const requestBody = {
    requests: [
      {
        inputConfig: {
          content: base64Pdf,
          mimeType: 'application/pdf',
        },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        // Process up to 5 pages
        pages: [1, 2, 3, 4, 5],
      },
    ],
  };

  // Use the files:annotate endpoint for PDF/batch
  const batchUrl = `https://vision.googleapis.com/v1/files:annotate?key=${env.GOOGLE_VISION_API_KEY}`;
  const res = await fetch(batchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Google Vision API PDF error: ${error}`);
  }

  const data = await res.json() as any;
  const responses = data.responses?.[0]?.responses || [];
  
  // Concatenate text from all pages
  const fullText = responses
    .map((r: any) => r.fullTextAnnotation?.text || '')
    .join('\n\n');

  return fullText || '';
};

// ─── Extract text from DOCX using mammoth ───────────────────────────────────
export const extractTextFromDocx = async (filePath: string): Promise<string> => {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
};
