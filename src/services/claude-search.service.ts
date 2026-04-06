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
  lat?: number;
  lng?: number;
}

// ─── Search for businesses using Claude + web_search tool ────────────────────
export const searchBusinesses = async (query: string): Promise<BusinessResult[]> => {
  const client = getClient();
  if (!client) {
    console.warn('ANTHROPIC_API_KEY not set — Claude business search unavailable');
    return [];
  }

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [
        {
          role: 'user',
          content: `Search for the business "${query}" and return up to 5 real matching businesses. For each, provide:
- name: full business name
- address: full street address including city, state/region, and country
- phone: phone number with country code (empty string if unknown)
- hours: typical opening hours (e.g. "Mon-Fri: 9am-5pm") or empty string if unknown
- category: type of business (e.g. "Pizza Restaurant", "Coffee Shop")
- lat: latitude as number if available (null if unknown)
- lng: longitude as number if available (null if unknown)

Return ONLY a valid JSON array. No markdown, no explanation, no code fences. Just the raw JSON array.
If no businesses found, return: []`,
        },
      ],
    });

    // Extract final text block (after tool use)
    const textBlock = [...response.content].reverse().find((b: any) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return [];

    let rawText = textBlock.text.trim();
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    // Extract JSON array from response (Claude may include extra text)
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((biz: any, i: number) => ({
      name: biz.name || query,
      address: biz.address || '',
      phone: biz.phone || '',
      hours: biz.hours || '',
      category: biz.category || '',
      placeId: `claude-${i}-${Date.now()}`,
      lat: typeof biz.lat === 'number' ? biz.lat : undefined,
      lng: typeof biz.lng === 'number' ? biz.lng : undefined,
    }));
  } catch (err: any) {
    console.error('Claude business search error:', err.message || err);
    return [];
  }
};
