import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import { env } from '../config/env.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// ─── Shared data shape (same as former groq.service interface) ───────────────
export interface CategorizedData {
  menu: {
    categories: Array<{
      name: string;
      items: Array<{
        name: string;
        description?: string;
        price: number;
      }>;
    }>;
  };
  hours: {
    schedule: Record<string, { open: string; close: string; closed?: boolean }>;
  } | null;
  contact: {
    phone?: string;
    email?: string;
    address?: string;
    website?: string;
  } | null;
  faq: Array<{ question: string; answer: string }> | null;
  summary: string | null;
  other: string | null;
}

const SCHEMA_PROMPT = `Return this exact JSON structure (use null for categories where no data is found):
{
  "menu": {
    "categories": [
      {
        "name": "Category Name",
        "items": [
          { "name": "Item Name", "description": "Description if available", "price": 9.99 }
        ]
      }
    ]
  },
  "hours": {
    "schedule": {
      "Monday":    { "open": "11:00 AM", "close": "10:00 PM" },
      "Tuesday":   { "open": "11:00 AM", "close": "10:00 PM" },
      "Wednesday": { "open": "11:00 AM", "close": "10:00 PM" },
      "Thursday":  { "open": "11:00 AM", "close": "10:00 PM" },
      "Friday":    { "open": "11:00 AM", "close": "11:00 PM" },
      "Saturday":  { "open": "11:00 AM", "close": "11:00 PM" },
      "Sunday":    { "open": "12:00 PM", "close": "9:00 PM", "closed": false }
    }
  },
  "contact": {
    "phone": "+44 123 456 7890",
    "email": "info@restaurant.com",
    "address": "123 Main Street, City, Postcode",
    "website": "https://restaurant.com"
  },
  "faq": [
    { "question": "Do you offer delivery?", "answer": "Yes, we deliver within 5 miles." }
  ],
  "summary": "A brief 2-3 sentence summary of the business including cuisine type, specialties, and atmosphere.",
  "other": "Any other relevant information not in the above categories"
}

RULES:
- Prices MUST be numbers — extract 9.99 from "£9.99", not a string
- No menu items found → set menu.categories to []
- hours / contact / faq / summary not found → set to null
- faq: include FAQs, policy statements, and common info as question/answer pairs
- Only include information you are confident about — do not hallucinate`;

function parseClaudeResponse(text: string): CategorizedData {
  const clean = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  try {
    return JSON.parse(clean) as CategorizedData;
  } catch {
    console.error('[claude.service] Failed to parse response:', clean.substring(0, 500));
    return {
      menu: { categories: [] },
      hours: null,
      contact: null,
      faq: null,
      summary: null,
      other: clean.substring(0, 500),
    };
  }
}

// ─── Scrape a URL and return clean text ─────────────────────────────────────
export const scrapeAndAnalyzeUrl = async (url: string): Promise<string> => {
  // Pass 1 — basic fetch + strip HTML
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TalkativBot/1.0)' },
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${url} (${res.status})`);

  const html = await res.text();
  const rawText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 15000);

  // Pass 2 — ask Claude to reconstruct Q&A pairs from the flat text
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content:
        `This text was scraped from ${url}. The page may be a FAQ page, menu page, or business info page. ` +
        `Even if answers appear truncated or cut off, extract as much as you can. For FAQ pages specifically, ` +
        `look for patterns like repeated question-like sentences followed by explanatory text and treat those ` +
        `as Q&A pairs. Be aggressive in finding answers — they may appear as plain paragraph text after each ` +
        `question heading.\n\nReturn the same text but with Q&A pairs clearly reconstructed where possible. ` +
        `Preserve all other content verbatim.\n\nTEXT:\n"""\n${rawText}\n"""`,
    }],
  });

  const enriched = message.content[0]?.type === 'text' ? message.content[0].text : rawText;
  return enriched;
};

// ─── Categorize raw text (URL / DOCX) with Claude ───────────────────────────
export const categorizeExtractedData = async (
  rawText: string,
  source: 'url' | 'pdf' | 'image'
): Promise<CategorizedData> => {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content:
        `You are a restaurant data extraction AI. Analyze the following text extracted from a ${source} ` +
        `and categorize ALL the information you can find. Return ONLY valid JSON, no markdown, no code blocks.\n\n` +
        `TEXT TO ANALYZE:\n"""\n${rawText.substring(0, 15000)}\n"""\n\n${SCHEMA_PROMPT}`,
    }],
  });

  const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
  return parseClaudeResponse(text);
};

// ─── Extract + categorize from image (PNG/JPG) using Claude Vision ───────────
export const extractAndCategorizeFromImage = async (filePath: string, mimeType: string): Promise<CategorizedData> => {
  const base64 = fs.readFileSync(filePath).toString('base64');
  const mediaType = mimeType === 'image/jpeg' || mimeType === 'image/jpg' ? 'image/jpeg' : 'image/png';

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
        {
          type: 'text',
          text:
            `You are a restaurant data extraction AI. Analyze this menu image and extract ALL ` +
            `information you can find. Return ONLY valid JSON, no markdown, no code blocks.\n\n${SCHEMA_PROMPT}`,
        },
      ],
    }],
  });

  const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
  return parseClaudeResponse(text);
};

// ─── Extract + categorize from PDF using Claude native PDF support ───────────
export const extractAndCategorizeFromPdf = async (filePath: string): Promise<CategorizedData> => {
  const base64 = fs.readFileSync(filePath).toString('base64');

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as any,
        {
          type: 'text',
          text:
            `You are a restaurant data extraction AI. Analyze this PDF document and extract ALL ` +
            `information you can find. Return ONLY valid JSON, no markdown, no code blocks.\n\n${SCHEMA_PROMPT}`,
        },
      ],
    }],
  });

  const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
  return parseClaudeResponse(text);
};
