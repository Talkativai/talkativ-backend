import Groq from 'groq-sdk';
import { env } from '../config/env.js';

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

// ─── Scrape and analyze a URL ───────────────────────────────────────────────
export const scrapeAndAnalyzeUrl = async (url: string): Promise<string> => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TalkativBot/1.0)',
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${url} (${res.status})`);

  const html = await res.text();

  const cleanText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 15000);

  return cleanText;
};

// ─── AI Categorization of extracted text ────────────────────────────────────
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

export const categorizeExtractedData = async (
  rawText: string,
  source: 'url' | 'pdf' | 'image'
): Promise<CategorizedData> => {
  const prompt = `You are a restaurant data extraction AI. Analyze the following text extracted from a ${source} and categorize ALL the information you can find into the following categories. Return ONLY valid JSON, no markdown, no code blocks.

TEXT TO ANALYZE:
"""
${rawText.substring(0, 12000)}
"""

Return this exact JSON structure (use null for categories you can't find data for):
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
      "Monday": { "open": "11:00 AM", "close": "10:00 PM" },
      "Tuesday": { "open": "11:00 AM", "close": "10:00 PM" },
      "Wednesday": { "open": "11:00 AM", "close": "10:00 PM" },
      "Thursday": { "open": "11:00 AM", "close": "10:00 PM" },
      "Friday": { "open": "11:00 AM", "close": "11:00 PM" },
      "Saturday": { "open": "11:00 AM", "close": "11:00 PM" },
      "Sunday": { "open": "12:00 PM", "close": "9:00 PM", "closed": false }
    }
  },
  "contact": {
    "phone": "+44 123 456 7890",
    "email": "info@restaurant.com",
    "address": "123 Main Street, City, Postcode",
    "website": "https://restaurant.com"
  },
  "faq": [
    { "question": "Do you offer delivery?", "answer": "Yes, we deliver within 5 miles." },
    { "question": "Do you cater for allergies?", "answer": "Yes, please inform staff of any dietary requirements." }
  ],
  "summary": "A brief 2-3 sentence summary of the business including cuisine type, specialties, and atmosphere.",
  "other": "Any other relevant information not in the above categories"
}

IMPORTANT RULES:
- For menu items, prices MUST be numbers (not strings). If price is "£9.99" extract 9.99
- If you find NO menu items, set menu.categories to an empty array []
- If hours/contact/faq/summary are not found, set them to null
- faq should be an array of question/answer pairs found in the content (FAQs, policy statements, common info)
- Only include information you are confident about
- Do not make up or hallucinate data`;

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 4096,
  });

  const responseText = completion.choices[0]?.message?.content ?? '';

  const cleanJson = responseText
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleanJson) as CategorizedData;
    return parsed;
  } catch (err) {
    console.error('Failed to parse Groq response:', cleanJson);
    return {
      menu: { categories: [] },
      hours: null,
      contact: null,
      faq: null,
      summary: null,
      other: rawText.substring(0, 500),
    };
  }
};
