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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [
        {
          role: 'user',
          content: `Use web search to find real businesses matching: "${query}". Return up to 5 results.

For each result provide these exact fields:
- name: full business name
- address: full street address including city, country
- countryCode: 2-letter ISO country code (e.g. "GB", "US", "NG") — derive from address
- phone: phone number with country code prefix (e.g. "+44 20 1234 5678"), empty string if not found
- hours: opening hours summary (e.g. "Mon-Fri: 9am-5pm, Sat: 10am-4pm"), empty string if unknown
- category: business type (e.g. "Pizza Restaurant", "Coffee Shop")
- lat: latitude as number or null
- lng: longitude as number or null

IMPORTANT: Return ONLY a raw JSON array — no markdown, no backticks, no explanation.
If nothing found: []`,
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
      countryCode: biz.countryCode || '',
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
