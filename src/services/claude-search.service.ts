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

// ─── In-memory cache: avoid hitting Claude for the same query within 5 minutes ─
const cache = new Map<string, { results: BusinessResult[]; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Search for businesses using Claude + web_search tool ────────────────────
export const searchBusinesses = async (query: string): Promise<BusinessResult[]> => {
  const client = getClient();
  if (!client) {
    console.warn('ANTHROPIC_API_KEY not set — Claude business search unavailable');
    return [];
  }

  // Return cached result if fresh
  const cacheKey = query.toLowerCase().trim();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.results;
  }

  // Abort after 8 seconds — balances quality vs. speed
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',   // Haiku is ~3× faster than Sonnet for this task
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [
        {
          role: 'user',
          content: `Search for: "${query}". Find up to 5 real matching businesses GLOBALLY (any country).

Return ONLY a JSON array, no markdown, no explanation:
[{"name":"","address":"","countryCode":"","phone":"","hours":"","category":"","lat":null,"lng":null,"website":"","photos":[]}]

- countryCode: 2-letter ISO (GB, US, NG, IN, etc.)
- phone: with country code e.g. "+44 20 1234 5678"
- hours: e.g. "Mon-Fri 9am-5pm, Sat 10am-4pm, Sun Closed" — check Google Maps or website
- photos: up to 2 direct image URLs (.jpg/.png/.webp) from their site/Yelp/TripAdvisor
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

    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    // Log token usage
    if (response.usage) {
      console.log(`[claude-search] in:${response.usage.input_tokens} out:${response.usage.output_tokens} total:${response.usage.input_tokens + response.usage.output_tokens}`);
    }

    const results: BusinessResult[] = parsed.map((biz: any, i: number) => ({
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
      photos: Array.isArray(biz.photos)
        ? biz.photos.filter((url: any) => typeof url === 'string' && url.startsWith('http')).slice(0, 2)
        : [],
    }));

    // Cache the result
    cache.set(cacheKey, { results, ts: Date.now() });
    return results;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.warn('Claude business search timed out (8s limit)');
      return [];
    }
    console.error('Claude business search error:', err.message || err);
    return [];
  }
};
