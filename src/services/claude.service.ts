import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import { env } from '../config/env.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// ─── Shared data shape ───────────────────────────────────────────────────────
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

// ─── Compact schema prompt (fewer example tokens) ────────────────────────────
const SCHEMA_PROMPT = `Return ONLY valid JSON (no markdown, no code blocks):
{"menu":{"categories":[{"name":"","items":[{"name":"","description":"","price":0}]}]},"hours":{"schedule":{"Monday":{"open":"","close":""}}},"contact":{"phone":"","email":"","address":"","website":""},"faq":[{"question":"","answer":""}],"summary":"","other":""}

Rules: prices=numbers, missing sections=null, menu.categories=[] if none found.`;

// ─── Simple token logger ─────────────────────────────────────────────────────
function logUsage(fn: string, usage: { input_tokens: number; output_tokens: number }) {
  console.log(`[claude] ${fn} — in:${usage.input_tokens} out:${usage.output_tokens} total:${usage.input_tokens + usage.output_tokens}`);
}

function parseClaudeResponse(text: string): CategorizedData {
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(clean) as CategorizedData;
  } catch {
    console.error('[claude] Failed to parse response:', clean.substring(0, 300));
    return { menu: { categories: [] }, hours: null, contact: null, faq: null, summary: null, other: clean.substring(0, 300) };
  }
}

// ─── Scrape a URL and return clean text (no Claude call — saves one round-trip) ─
export const scrapeAndAnalyzeUrl = async (url: string): Promise<string> => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TalkativBot/1.0)' },
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${url} (${res.status})`);

  const html = await res.text();
  // Strip scripts/styles/tags then trim to 8000 chars (enough for any menu page)
  const rawText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 8000);

  return rawText; // send directly to categorizeExtractedData — no extra Claude call
};

// ─── Categorize raw text — Haiku (fast + cheap, handles structured extraction) ─
export const categorizeExtractedData = async (
  rawText: string,
  source: 'url' | 'pdf' | 'image'
): Promise<CategorizedData> => {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Extract restaurant data from this ${source} text. ${SCHEMA_PROMPT}\n\nTEXT:\n${rawText.substring(0, 8000)}`,
    }],
  });

  logUsage('categorizeExtractedData', message.usage);
  const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
  return parseClaudeResponse(text);
};

// ─── Extract from image — keep Sonnet (vision accuracy matters for menus) ────
export const extractAndCategorizeFromImage = async (filePath: string, mimeType: string): Promise<CategorizedData> => {
  const base64 = fs.readFileSync(filePath).toString('base64');
  const mediaType = mimeType === 'image/jpeg' || mimeType === 'image/jpg' ? 'image/jpeg' : 'image/png';

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001', // Haiku supports vision and is 3× cheaper
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: `Extract all restaurant data from this menu image. ${SCHEMA_PROMPT}` },
      ],
    }],
  });

  logUsage('extractAndCategorizeFromImage', message.usage);
  const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
  return parseClaudeResponse(text);
};

// ─── Extract from PDF — Haiku (PDF reading doesn't need Sonnet intelligence) ─
export const extractAndCategorizeFromPdf = async (filePath: string): Promise<CategorizedData> => {
  const base64 = fs.readFileSync(filePath).toString('base64');

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as any,
        { type: 'text', text: `Extract all restaurant data from this PDF. ${SCHEMA_PROMPT}` },
      ],
    }],
  });

  logUsage('extractAndCategorizeFromPdf', message.usage);
  const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
  return parseClaudeResponse(text);
};
