// ─── Claude-powered Business Search — DISABLED ──────────────────────────────
// Replaced by Foursquare Places API (foursquare-search.service.ts)
// Kept for reference only.

/*
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

const getClient = () => {
  if (!env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
};

interface BusinessResult {
  name: string;
  address: string;
  phone: string;
  hours: string;
  category: string;
  placeId: string;
}

export const searchBusinesses = async (query: string): Promise<BusinessResult[]> => {
  const client = getClient();
  if (!client) {
    console.warn('ANTHROPIC_API_KEY not set — Claude business search unavailable');
    return [];
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `I'm searching for a business called "${query}". Please search your knowledge and return up to 5 real businesses that match this name. For each business, provide:
- name: the full business name
- address: the full street address including city, state/region, and country
- phone: phone number with country code (or empty string if unknown)
- hours: typical opening hours summary (e.g. "Mon-Fri: 9am-5pm, Sat: 10am-3pm") or empty string if unknown
- category: the type of business (e.g. "Pizza Restaurant", "Coffee Shop", "Hair Salon")

IMPORTANT: Return ONLY a valid JSON array. No markdown, no explanation, no code fences. Just the raw JSON array.
If you can't find any real businesses matching that name, return an empty array: []

Example format:
[{"name":"Tony's Pizzeria","address":"42 Market Street, Manchester, M1 1PW, UK","phone":"+44 161 234 5678","hours":"Mon-Sun: 11am-11pm","category":"Pizza Restaurant"}]`
        }
      ],
    });

    const textBlock = message.content.find((b: any) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return [];

    let rawText = textBlock.text.trim();

    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((biz: any, i: number) => ({
      name: biz.name || query,
      address: biz.address || '',
      phone: biz.phone || '',
      hours: biz.hours || '',
      category: biz.category || '',
      placeId: `claude-${i}-${Date.now()}`,
    }));
  } catch (err: any) {
    console.error('Claude business search error:', err.message || err);
    return [];
  }
};
*/
