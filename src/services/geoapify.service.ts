import { env } from '../config/env.js';

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

// ─── Search for businesses using Geoapify Geocoding API ──────────────────────
// Free tier: 3000 req/day. Returns GeoJSON FeatureCollection.
export const searchBusinesses = async (query: string): Promise<BusinessResult[]> => {
  if (!env.GEOAPIFY_API_KEY) {
    console.warn('GEOAPIFY_API_KEY not set — Geoapify business search unavailable');
    return [];
  }

  const url = new URL('https://api.geoapify.com/v1/geocode/search');
  url.searchParams.set('text', query);
  url.searchParams.set('limit', '5');
  url.searchParams.set('type', 'amenity');
  url.searchParams.set('apiKey', env.GEOAPIFY_API_KEY);

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.warn(`[geoapify] HTTP ${res.status}: ${res.statusText}`);
      return [];
    }

    const data: any = await res.json();
    const features: any[] = data?.features ?? [];

    const results: BusinessResult[] = features
      .filter((f: any) => f?.properties?.name)
      .map((f: any, i: number) => {
        const p = f.properties;
        const hoursRaw = p.opening_hours ?? '';
        const catRaw: string = Array.isArray(p.categories)
          ? p.categories[0]?.replace(/_/g, ' ') ?? ''
          : '';

        return {
          name: p.name ?? query,
          address: p.formatted ?? '',
          countryCode: (p.country_code ?? '').toUpperCase(),
          phone: p.contact?.phone ?? p.datasource?.raw?.phone ?? '',
          hours: hoursRaw,
          category: catRaw,
          placeId: p.place_id ?? `geoapify-${i}-${Date.now()}`,
          lat: typeof p.lat === 'number' ? p.lat : undefined,
          lng: typeof p.lon === 'number' ? p.lon : undefined,
          website: p.website ?? p.datasource?.raw?.website ?? '',
          photos: [], // Geoapify free tier does not return photos
        };
      });

    console.log(`[geoapify] "${query}" → ${results.length} results`);
    return results;
  } catch (err: any) {
    console.warn('[geoapify] search failed:', err.message ?? err);
    return [];
  }
};
