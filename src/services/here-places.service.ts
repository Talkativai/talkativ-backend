import { env } from '../config/env.js';

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

// ─── Search businesses using HERE Geocoding & Search API ─────────────────────
export const searchBusinesses = async (query: string): Promise<BusinessResult[]> => {
  const apiKey = env.HERE_API_KEY;
  if (!apiKey) return [];

  const url = new URL('https://discover.search.hereapi.com/v1/discover');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '5');
  url.searchParams.set('apiKey', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error('HERE Places search error:', await res.text());
    return [];
  }

  const data = await res.json() as any;

  return (data.items || []).map((item: any) => ({
    name: item.title || '',
    address: item.address?.label || '',
    phone: item.contacts?.[0]?.phone?.[0]?.value || '',
    hours: formatHours(item.openingHours),
    category: item.categories?.[0]?.name || '',
    placeId: item.id || '',
    lat: item.position?.lat,
    lng: item.position?.lng,
  }));
};

function formatHours(openingHours: any[]): string {
  if (!openingHours?.length) return '';
  return openingHours[0]?.text?.join(', ') || '';
}
