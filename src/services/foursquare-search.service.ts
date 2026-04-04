import { env } from '../config/env.js';

// ─── Foursquare Places API Business Search ───────────────────────────────────

export interface BusinessResult {
  name: string;
  address: string;
  phone: string;
  hours: string;
  category: string;
  placeId: string;
  lat: number;
  lng: number;
  countryCode: string;
  country: string;
}

export const searchBusinesses = async (query: string): Promise<BusinessResult[]> => {
  if (!env.FOURSQUARE_API_KEY) {
    console.warn('FOURSQUARE_API_KEY not set — Foursquare business search unavailable');
    return [];
  }

  try {
    const url = new URL('https://api.foursquare.com/v3/places/search');
    url.searchParams.set('query', query);
    url.searchParams.set('limit', '5');
    url.searchParams.set('fields', 'fsq_id,name,location,categories,tel,hours,geocodes');

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': env.FOURSQUARE_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Foursquare API error:', response.status, await response.text());
      return [];
    }

    const data = await response.json();

    return (data.results || []).map((place: any) => ({
      name: place.name || query,
      address: place.location?.formatted_address || place.location?.address || '',
      phone: place.tel || '',
      hours: place.hours?.display || '',
      category: place.categories?.[0]?.name || '',
      placeId: place.fsq_id || '',
      lat: place.geocodes?.main?.latitude ?? 0,
      lng: place.geocodes?.main?.longitude ?? 0,
      countryCode: place.location?.cc || '',
      country: place.location?.country || '',
    }));
  } catch (err: any) {
    console.error('Foursquare business search error:', err.message || err);
    return [];
  }
};
