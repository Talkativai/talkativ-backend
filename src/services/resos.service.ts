// ─── resOS API Service ────────────────────────────────────────────────────────
// Handles reservation create / update / cancel via resOS REST API
// Docs: https://app.resos.com/api/docs

const RESOS_BASE = 'https://app.resos.com/api/v1';

export interface ResOSReservationPayload {
  guestName: string;
  guestPhone?: string | null;
  guestEmail?: string | null;
  guests: number;
  dateTime: string; // ISO 8601
  notes?: string | null;
}

export interface ResOSResult {
  success: boolean;
  reservationId?: string;
  message?: string;
}

const resosHeaders = (apiKey: string, propertyId: string) => ({
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'X-Property-ID': propertyId,
});

// ─── Create reservation ───────────────────────────────────────────────────────
export const createResOSReservation = async (
  apiKey: string,
  propertyId: string,
  payload: ResOSReservationPayload
): Promise<ResOSResult> => {
  try {
    const res = await fetch(`${RESOS_BASE}/reservations`, {
      method: 'POST',
      headers: resosHeaders(apiKey, propertyId),
      body: JSON.stringify({
        property_id: propertyId,
        guest_name: payload.guestName,
        guest_phone: payload.guestPhone || null,
        guest_email: payload.guestEmail || null,
        covers: payload.guests,
        date_time: payload.dateTime,
        notes: payload.notes || null,
        source: 'talkativ_voice_agent',
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error('[resOS] Create reservation failed:', error);
      return { success: false, message: error };
    }

    const data = await res.json() as any;
    return {
      success: true,
      reservationId: data.id || data.reservation_id,
    };
  } catch (e) {
    console.error('[resOS] Service error:', e);
    return { success: false, message: 'Failed to reach resOS' };
  }
};

// ─── Update reservation ───────────────────────────────────────────────────────
export const updateResOSReservation = async (
  apiKey: string,
  propertyId: string,
  resosReservationId: string,
  updates: {
    guests?: number;
    dateTime?: string;
    notes?: string;
  }
): Promise<ResOSResult> => {
  try {
    const res = await fetch(
      `${RESOS_BASE}/reservations/${resosReservationId}`,
      {
        method: 'PATCH',
        headers: resosHeaders(apiKey, propertyId),
        body: JSON.stringify({
          ...(updates.guests && { covers: updates.guests }),
          ...(updates.dateTime && { date_time: updates.dateTime }),
          ...(updates.notes && { notes: updates.notes }),
        }),
      }
    );

    if (!res.ok) {
      const error = await res.text();
      console.error('[resOS] Update reservation failed:', error);
      return { success: false, message: error };
    }

    return { success: true };
  } catch (e) {
    console.error('[resOS] Update error:', e);
    return { success: false, message: 'Failed to reach resOS' };
  }
};

// ─── List reservations ────────────────────────────────────────────────────────
export const listResOSReservations = async (
  apiKey: string,
  propertyId: string,
): Promise<any[]> => {
  try {
    const res = await fetch(`${RESOS_BASE}/reservations`, {
      headers: resosHeaders(apiKey, propertyId),
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    return data.data || data.reservations || (Array.isArray(data) ? data : []);
  } catch {
    return [];
  }
};

// ─── Check availability ───────────────────────────────────────────────────────
export interface ResOSAvailabilitySlot {
  time: string;
  available: boolean;
}

export const checkResOSAvailability = async (
  apiKey: string,
  propertyId: string,
  date: string,
  time: string,
  guests: number,
): Promise<{ available: boolean; slots: ResOSAvailabilitySlot[] }> => {
  try {
    const params = new URLSearchParams({ date, time, covers: String(guests) });
    const res = await fetch(`${RESOS_BASE}/availability?${params}`, {
      headers: resosHeaders(apiKey, propertyId),
    });
    if (!res.ok) return { available: false, slots: [] };
    const data = await res.json() as any;
    // Normalize — resOS returns available time slots array
    const slots: ResOSAvailabilitySlot[] = (data.slots || data.available_times || []).map((s: any) => ({
      time: s.time || s.start_time || s,
      available: s.available !== false,
    }));
    const requestedSlot = slots.find(s => s.time === time || s.time?.startsWith(time));
    return {
      available: requestedSlot?.available ?? slots.length > 0,
      slots: slots.filter(s => s.available),
    };
  } catch {
    return { available: false, slots: [] };
  }
};

// ─── Cancel reservation ───────────────────────────────────────────────────────
export const cancelResOSReservation = async (
  apiKey: string,
  propertyId: string,
  resosReservationId: string
): Promise<ResOSResult> => {
  try {
    const res = await fetch(
      `${RESOS_BASE}/reservations/${resosReservationId}`,
      {
        method: 'DELETE',
        headers: resosHeaders(apiKey, propertyId),
      }
    );

    if (!res.ok) {
      const error = await res.text();
      console.error('[resOS] Cancel reservation failed:', error);
      return { success: false, message: error };
    }

    return { success: true };
  } catch (e) {
    console.error('[resOS] Cancel error:', e);
    return { success: false, message: 'Failed to reach resOS' };
  }
};
