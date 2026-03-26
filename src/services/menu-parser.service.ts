import fs from 'fs';
import path from 'path';

// ─── PDF Parsing ─────────────────────────────────────────────────────────────

export const parsePdfToText = async (filePath: string): Promise<string> => {
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = fs.readFileSync(filePath);
  const result = await pdfParse(buffer);
  return result.text;
};

// ─── DOCX Parsing ────────────────────────────────────────────────────────────

export const parseDocxToText = async (filePath: string): Promise<string> => {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
};

// ─── URL Scraping ────────────────────────────────────────────────────────────

export const scrapeMenuFromUrl = async (url: string): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch URL: ${url}`);
  const html = await res.text();
  // Basic HTML tag stripping — in production, use a proper parser
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

// ─── Menu Text → Structured ─────────────────────────────────────────────────

export interface ParsedMenuItem {
  name: string;
  description?: string;
  price: number;
  category: string;
}

export const parseMenuText = (rawText: string): ParsedMenuItem[] => {
  // Simple line-by-line parser
  // In production, this would use AI (GPT/Claude) to extract structured menu data
  const items: ParsedMenuItem[] = [];
  const lines = rawText.split('\n').filter((l) => l.trim());
  let currentCategory = 'Uncategorized';

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect price pattern: "Item name ... £9.99" or "Item name - 9.99"
    const priceMatch = trimmed.match(/^(.+?)[\s\-–—]+[£$]?\s*(\d+\.?\d*)\s*$/);
    if (priceMatch) {
      items.push({
        name: priceMatch[1].trim(),
        price: parseFloat(priceMatch[2]),
        category: currentCategory,
      });
    } else if (trimmed.toUpperCase() === trimmed && trimmed.length > 2 && trimmed.length < 50) {
      // ALL CAPS line likely a category header
      currentCategory = trimmed.charAt(0) + trimmed.slice(1).toLowerCase();
    }
  }

  return items;
};

// ─── Deduplication ───────────────────────────────────────────────────────────

export const deduplicateItems = (
  existingItems: { name: string }[],
  newItems: ParsedMenuItem[]
): ParsedMenuItem[] => {
  const existingNames = new Set(existingItems.map((i) => i.name.toLowerCase()));
  return newItems.filter((item) => !existingNames.has(item.name.toLowerCase()));
};
