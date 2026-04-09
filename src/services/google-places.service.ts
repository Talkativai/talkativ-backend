import { env } from '../config/env.js';

const BASE = 'https://maps.googleapis.com/maps/api/place';

// ─── Photo URL (old Places API) ───────────────────────────────────────────────
const buildPhotoUrl = (photoReference: string, maxWidth = 400): string =>
  `${BASE}/photo?maxwidth=${maxWidth}&photoreference=${encodeURIComponent(photoReference)}&key=${env.GOOGLE_PLACES_API}`;

// ─── Day mapping: old API uses 0=Sun, 1=Mon, ..., 6=Sat ─────────────────────
const DAY_MAP: Record<number, string> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };

// ─── Parse old API's opening_hours.periods into our structured format ─────────
// Old API uses "hours"/"minutes" (not "hour"/"minute" like the new API)
function parseOpeningHoursStructured(openingHours: any): Record<string, string> {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const result: Record<string, string> = { is24h: 'false' };
  days.forEach(d => { result[d] = 'closed'; });

  if (!openingHours?.periods?.length) return result;

  // 24/7 detection: single period, open day 0, time "0000", no close
  if (openingHours.periods.length === 1 && !openingHours.periods[0].close) {
    return { is24h: 'true' };
  }

  for (const period of openingHours.periods) {
    const dayKey = DAY_MAP[period.open?.day];
    if (!dayKey) continue;
    const openH = String(period.open.hours ?? 0).padStart(2, '0');
    const openM = String(period.open.minutes ?? 0).padStart(2, '0');
    const closeH = String(period.close?.hours ?? 23).padStart(2, '0');
    const closeM = String(period.close?.minutes ?? 59).padStart(2, '0');
    result[dayKey] = `${openH}:${openM}-${closeH}:${closeM}`;
  }

  return result;
}

// ─── Main search: text search + parallel details calls ───────────────────────
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
    // Step 1: Text Search
    const textUrl = new URL(`${BASE}/textsearch/json`);
    textUrl.searchParams.set('query', query);
    textUrl.searchParams.set('key', apiKey);

    const textRes = await fetch(textUrl.toString());
    if (!textRes.ok) {
      console.error('Places text search HTTP error:', textRes.status);
      return [];
    }

    const textData = await textRes.json() as any;
    if (textData.status !== 'OK' && textData.status !== 'ZERO_RESULTS') {
      console.error('Places text search error:', textData.status, textData.error_message);
      return [];
    }

    const places = (textData.results || []).slice(0, 5);
    if (places.length === 0) return [];

    // Step 2: Fetch Place Details for each result in parallel (phone, hours, country)
    const detailsList = await Promise.all(places.map(async (place: any) => {
      try {
        const detailUrl = new URL(`${BASE}/details/json`);
        detailUrl.searchParams.set('place_id', place.place_id);
        detailUrl.searchParams.set('fields', 'name,formatted_address,international_phone_number,opening_hours,photos,types,address_components,geometry');
        detailUrl.searchParams.set('key', apiKey);

        const res = await fetch(detailUrl.toString());
        if (!res.ok) return null;
        const data = await res.json() as any;
        return data.status === 'OK' ? data.result : null;
      } catch {
        return null;
      }
    }));

    return places.map((place: any, i: number) => {
      const detail = detailsList[i];

      // Country code
      const addrComponents = detail?.address_components || [];
      const countryComp = addrComponents.find((c: any) => c.types?.includes('country'));
      const countryCode = countryComp?.short_name || '';

      // Photos (prefer detail photos, fall back to text search photos)
      const rawPhotos = (detail?.photos || place.photos || []).slice(0, 3);
      const photos: string[] = rawPhotos
        .map((p: any) => p.photo_reference ? buildPhotoUrl(p.photo_reference) : null)
        .filter(Boolean);

      // Opening hours
      const openingHours = detail?.opening_hours || null;
      const hours = openingHours?.weekday_text?.join(', ') || '';
      const openingHoursStructured = parseOpeningHoursStructured(openingHours);

      // Category from types (strip generic types)
      const types: string[] = detail?.types || place.types || [];
      const skipTypes = new Set(['establishment', 'point_of_interest', 'food', 'store', 'health', 'premise']);
      const category = types.find(t => !skipTypes.has(t))?.replace(/_/g, ' ') || types[0]?.replace(/_/g, ' ') || '';

      const location = detail?.geometry?.location || place.geometry?.location;

      return {
        name: detail?.name || place.name || '',
        address: detail?.formatted_address || place.formatted_address || '',
        countryCode,
        phone: detail?.international_phone_number || '',
        hours,
        openingHoursStructured,
        category,
        placeId: place.place_id || '',
        lat: location?.lat,
        lng: location?.lng,
        photos,
      };
    });
  } catch (err: any) {
    console.error('Google Places search error:', err.message || err);
    return [];
  }
};
