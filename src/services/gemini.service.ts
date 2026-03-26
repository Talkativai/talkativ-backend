import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';

const genAI = new GoogleGenerativeAI(env.GOOGLE_GEMINI_API_KEY);

// ─── Scrape and analyze a URL ───────────────────────────────────────────────
export const scrapeAndAnalyzeUrl = async (url: string): Promise<string> => {
  // Fetch the webpage HTML
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TalkativBot/1.0)',
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${url} (${res.status})`);

  const html = await res.text();

  // Strip script/style tags first, then HTML tags for a cleaner text
  const cleanText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 15000); // Limit to ~15K chars for Gemini context

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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  // Clean the response — remove markdown code blocks if present
  const cleanJson = responseText
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleanJson) as CategorizedData;
    return parsed;
  } catch (err) {
    console.error('Failed to parse Gemini response:', cleanJson);
    // Return empty structure on parse failure
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
