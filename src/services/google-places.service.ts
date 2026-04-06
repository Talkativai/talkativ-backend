import { env } from '../config/env.js';

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
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.primaryTypeDisplayName,places.regularOpeningHours,places.location,places.addressComponents',
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
      };
    });
  } catch (err: any) {
    console.error('Google Places search error:', err.message || err);
    return [];
  }
};
