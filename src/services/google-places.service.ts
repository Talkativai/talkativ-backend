import { env } from '../config/env.js';

// ─── Build a photo URL from a Google Places photo resource name ──────────────
const buildPhotoUrl = (photoName: string, maxWidth = 400): string =>
  `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${env.GOOGLE_PLACES_API}`;

// ─── Day index to key mapping (Google: 0=Sun, 1=Mon, ..., 6=Sat) ─────────────
const DAY_MAP: Record<number, string> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };

// ─── Parse Google's regularOpeningHours into our structured format ────────────
function parseOpeningHoursStructured(regularOpeningHours: any): Record<string, string> {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const result: Record<string, string> = { is24h: 'false' };
  days.forEach(d => { result[d] = 'closed'; });

  if (!regularOpeningHours?.periods?.length) return result;

  // 24/7 detection: single period with no close time
  if (regularOpeningHours.periods.length === 1 && !regularOpeningHours.periods[0].close) {
    return { is24h: 'true' };
  }

  for (const period of regularOpeningHours.periods) {
    const dayKey = DAY_MAP[period.open?.day];
    if (!dayKey) continue;
    const openH = String(period.open.hour ?? 0).padStart(2, '0');
    const openM = String(period.open.minute ?? 0).padStart(2, '0');
    const closeH = String(period.close?.hour ?? 23).padStart(2, '0');
    const closeM = String(period.close?.minute ?? 59).padStart(2, '0');
    result[dayKey] = `${openH}:${openM}-${closeH}:${closeM}`;
  }

  return result;
}

// ─── Search with multiple results via Google Places Text Search ──────────────
export const searchBusinesses = async (query: string): Promise<Array<{
  name: string;
  address: string;
  countryCode: string;
  phone: string;
  hours: string;
  openingHoursStructured: Record<string, string>;
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
        openingHoursStructured: parseOpeningHoursStructured(place.regularOpeningHours),
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
