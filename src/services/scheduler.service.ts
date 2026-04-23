import prisma from '../config/db.js';
import * as twilioService from './twilio.service.js';

// ─── Reservation reminder SMS ─────────────────────────────────────────────────
// Runs every hour. Finds upcoming reservations in the next 24 hours where
// reminderSent is false, sends an SMS reminder, and marks reminderSent = true.

export async function sendReservationReminders(): Promise<void> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const upcoming = await prisma.reservation.findMany({
    where: {
      status: 'CONFIRMED',
      reminderSent: false,
      dateTime: { gte: now, lte: in24h },
      guestPhone: { not: null },
    },
    include: { business: true },
  });

  for (const res of upcoming) {
    if (!res.guestPhone) continue;
    if (!twilioService.isValidPhoneNumber(res.guestPhone)) continue;

    const formattedDate = res.dateTime.toLocaleDateString('en-GB', {
      weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const ref = res.talkativRef || `#${res.id.slice(0, 8)}`;

    try {
      await twilioService.sendSms(
        res.guestPhone,
        `Hi ${res.guestName}, this is a reminder that your table for ${res.guests} at ${res.business.name} is booked for tomorrow — ${formattedDate}. Booking ref: ${ref}. See you then!`,
      );
      await prisma.reservation.update({ where: { id: res.id }, data: { reminderSent: true } });
      console.log(`[Reminder] Sent SMS to ${res.guestPhone} for reservation ${ref}`);
    } catch (err) {
      console.error(`[Reminder] Failed to send for reservation ${res.id}:`, err);
    }
  }
}

// ─── Scheduler entry point ────────────────────────────────────────────────────
// Call this once at server startup; it loops every hour indefinitely.

export function startScheduler(): void {
  const HOUR_MS = 60 * 60 * 1000;

  const tick = () => {
    sendReservationReminders().catch(err =>
      console.error('[Scheduler] sendReservationReminders error:', err),
    );
  };

  // Run once immediately on startup, then every hour
  tick();
  setInterval(tick, HOUR_MS);
  console.log('[Scheduler] Reservation reminder scheduler started (every 1h)');
}
