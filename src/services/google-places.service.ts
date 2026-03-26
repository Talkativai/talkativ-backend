import { env } from '../config/env.js';

// ─── Search for a business by name using Google Places Text Search ──────────
export const searchBusiness = async (query: string): Promise<{
  name: string;
  address: string;
  phone: string;
  hours: string;
  category: string;
  placeId: string;
  lat?: number;
  lng?: number;
} | null> => {
  if (!env.GOOGLE_GEMINI_API_KEY && !env.GOOGLE_VISION_API_KEY) {
    // Fallback: no API key available
    return null;
  }

  // Use Google Places Text Search API (New)
  const apiKey = env.GOOGLE_VISION_API_KEY || env.GOOGLE_GEMINI_API_KEY;
  
  // First: Text Search to find the place
  const searchRes = await fetch(
    `https://places.googleapis.com/v1/places:searchText`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.primaryTypeDisplayName,places.currentOpeningHours,places.regularOpeningHours,places.location',
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
      }),
    }
  );

  if (!searchRes.ok) {
    console.error('Google Places search error:', await searchRes.text());
    return null;
  }

  const searchData = await searchRes.json() as any;
  const place = searchData.places?.[0];
  if (!place) return null;

  // Format opening hours
  let hoursStr = '';
  if (place.regularOpeningHours?.weekdayDescriptions) {
    hoursStr = place.regularOpeningHours.weekdayDescriptions.join(', ');
  } else if (place.currentOpeningHours?.weekdayDescriptions) {
    hoursStr = place.currentOpeningHours.weekdayDescriptions.join(', ');
  }

  return {
    name: place.displayName?.text || query,
    address: place.formattedAddress || '',
    phone: place.internationalPhoneNumber || '',
    hours: hoursStr,
    category: place.primaryTypeDisplayName?.text || '',
    placeId: place.id || '',
    lat: place.location?.latitude,
    lng: place.location?.longitude,
  };
};

// ─── Search with multiple results ───────────────────────────────────────────
export const searchBusinesses = async (query: string): Promise<Array<{
  name: string;
  address: string;
  phone: string;
  hours: string;
  category: string;
  placeId: string;
}>> => {
  const apiKey = env.GOOGLE_VISION_API_KEY || env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) return [];

  const searchRes = await fetch(
    `https://places.googleapis.com/v1/places:searchText`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.primaryTypeDisplayName,places.regularOpeningHours',
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 5,
      }),
    }
  );

  if (!searchRes.ok) return [];

  const data = await searchRes.json() as any;
  return (data.places || []).map((place: any) => ({
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    phone: place.internationalPhoneNumber || '',
    hours: place.regularOpeningHours?.weekdayDescriptions?.join(', ') || '',
    category: place.primaryTypeDisplayName?.text || '',
    placeId: place.id || '',
  }));
};
