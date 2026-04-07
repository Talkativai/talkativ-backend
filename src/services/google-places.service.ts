import { env } from '../config/env.js';

// ─── Build a photo URL from a Google Places photo resource name ──────────────
const buildPhotoUrl = (photoName: string, maxWidth = 400): string =>
  `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${env.GOOGLE_PLACES_API}`;

// ─── Search with multiple results via Google Places Text Search ──────────────
export const searchBusinesses = async (query: string): Promise<Array<{
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
}>> => {
  const apiKey = env.GOOGLE_PLACES_API;
  if (!apiKey) return [];

  try {
    const searchRes = await fetch(
      `https://places.googleapis.com/v1/places:searchText`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.primaryTypeDisplayName,places.regularOpeningHours,places.location,places.addressComponents,places.photos',
        },
        body: JSON.stringify({
          textQuery: query,
          maxResultCount: 5,
        }),
      }
    );

    if (!searchRes.ok) {
      console.error('Google Places search error:', await searchRes.text());
      return [];
    }

    const data = await searchRes.json() as any;
    return (data.places || []).map((place: any) => {
      // Extract 2-letter country code from addressComponents
      const countryComponent = (place.addressComponents || []).find(
        (c: any) => c.types?.includes('country')
      );
      const countryCode = countryComponent?.shortText || '';

      // Build photo URLs (up to 3)
      const photos: string[] = (place.photos || [])
        .slice(0, 3)
        .map((p: any) => p.name ? buildPhotoUrl(p.name) : null)
        .filter(Boolean);

      return {
        name: place.displayName?.text || '',
        address: place.formattedAddress || '',
        countryCode,
        phone: place.internationalPhoneNumber || '',
        hours: place.regularOpeningHours?.weekdayDescriptions?.join(', ') || '',
        category: place.primaryTypeDisplayName?.text || '',
        placeId: place.id || '',
        lat: place.location?.latitude,
        lng: place.location?.longitude,
        photos,
      };
    });
  } catch (err: any) {
    console.error('Google Places search error:', err.message || err);
    return [];
  }
};
