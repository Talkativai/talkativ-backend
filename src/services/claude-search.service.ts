import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

const getClient = () => {
  if (!env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
};

interface BusinessResult {
  name: string;
  address: string;
  countryCode: string;
  phone: string;
  hours: string;
  category: string;
  placeId: string;
  lat?: number;
  lng?: number;
  photos: string[];
  website?: string;
}

// ─── Search for businesses using Claude + web_search tool ────────────────────
export const searchBusinesses = async (query: string): Promise<BusinessResult[]> => {
  const client = getClient();
  if (!client) {
    console.warn('ANTHROPIC_API_KEY not set — Claude business search unavailable');
    return [];
  }

  // Abort after 15 seconds (web_search needs time, but we want a reasonable cap)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [
        {
          role: 'user',
          content: `Use web search to find real businesses matching: "${query}". Search GLOBALLY — the business could be in ANY country (UK, US, Nigeria, India, etc.). Return up to 5 results.

For each result provide these exact fields:
- name: full business name
- address: full street address including city, state/region, country
- countryCode: 2-letter ISO country code (e.g. "GB", "US", "NG", "IN") — derive from address
- phone: phone number with country code prefix (e.g. "+44 20 1234 5678"), empty string if not found
- hours: opening hours summary (e.g. "Mon-Fri: 9am-5pm, Sat: 10am-4pm, Sun: Closed"), empty string if unknown. Try hard to find this from Google Maps, Yelp, or the business website.
- category: business type (e.g. "Pizza Restaurant", "Coffee Shop", "Nigerian Restaurant")
- lat: latitude as number or null
- lng: longitude as number or null
- website: business website URL if found, empty string if not
- photos: array of up to 3 direct image URLs of the business (storefront photos, interior, food photos). Look for images on their website, Google Business listing, Yelp, TripAdvisor, or social media. Only include URLs that end in image extensions (.jpg, .png, .webp) or are from known image CDNs. Empty array [] if no images found.

IMPORTANT: Return ONLY a raw JSON array — no markdown, no backticks, no explanation.
If nothing found: []`,
        },
      ],
    }, { signal: controller.signal as any });

    clearTimeout(timeout);

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
      website: biz.website || '',
      photos: Array.isArray(biz.photos) ? biz.photos.filter((url: any) => typeof url === 'string' && url.startsWith('http')) : [],
    }));
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.warn('Claude business search timed out (15s limit)');
      return [];
    }
    console.error('Claude business search error:', err.message || err);
    return [];
  }
};
