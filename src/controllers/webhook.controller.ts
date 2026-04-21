import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import { env } from '../config/env.js';
import stripe from '../config/stripe.js';
import * as stripeService from '../services/stripe.service.js';
import * as emailService from '../services/email.service.js';
import * as twilioService from '../services/twilio.service.js';
import * as posService from '../services/pos.service.js';
import * as resosService from '../services/resos.service.js';
import crypto from 'crypto';
import * as paymentProviders from '../services/payment-providers.service.js';
import * as elevenlabsService from '../services/elevenlabs.service.js';

// ─── Helper: push reservation to whichever platform is connected ─────────────

async function pushReservationToIntegration(
  integration: any,
  reservationId: string,
  data: { guestName: string; guestPhone: string | null; guests: number; dateTime: string; notes: string | null },
) {
  const cfg = integration.config as any;

  if (integration.name === 'resOS' && cfg?.apiKey && cfg?.propertyId) {
    const result = await resosService.createResOSReservation(cfg.apiKey, cfg.propertyId, data);
    if (result.success && result.reservationId) {
      await prisma.reservation.update({ where: { id: reservationId }, data: { externalId: result.reservationId } });
      console.log(`[resOS] Reservation pushed — ID: ${result.reservationId}`);
    } else {
      console.error('[resOS] Push failed:', result.message);
    }
    return;
  }

  if (integration.name === 'ResDiary' && cfg?.apiKey && cfg?.restaurantId) {
    try {
      const res = await fetch(`https://api.resdiary.com/api/v1/restaurant/${encodeURIComponent(cfg.restaurantId)}/reservations`, {
        method: 'POST',
        headers: { 'Authorization': `ApiKey ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: data.guestName.split(' ')[0] || data.guestName,
          lastName: data.guestName.split(' ').slice(1).join(' ') || '',
          phone: data.guestPhone || '',
          covers: data.guests,
          visitDateTime: data.dateTime,
          notes: data.notes || '',
        }),
      });
      if (res.ok) {
        const body = await res.json() as any;
        if (body?.id) {
          await prisma.reservation.update({ where: { id: reservationId }, data: { externalId: String(body.id) } });
        }
        console.log('[ResDiary] Reservation pushed');
      } else {
        console.error('[ResDiary] Push failed:', res.status, await res.text());
      }
    } catch (err) {
      console.error('[ResDiary] Push error:', err);
    }
    return;
  }

  // OpenTable and Collins: credentials stored, push not yet implemented (requires partner approval)
  console.log(`[${integration.name}] Reservation stored locally — direct push not yet available.`);
}

// ─── Helper: resolve caller phone from conversation context ──────────────────
// ElevenLabs sends conversation_id with every tool webhook call.
// We first look up the LIVE call record (populated at call start), then fall back
// to the ElevenLabs API. This lets us auto-detect the caller's number so the
// agent never needs to ask for it.
async function resolveCallerPhone(
  conversationId: string | undefined,
  businessId: string,
  providedPhone: string | undefined,
): Promise<string | null> {
  if (providedPhone) return providedPhone;

  // Check the LIVE call record populated by conversation_initiation_metadata
  const query: any = { businessId, status: 'LIVE' };
  if (conversationId) query.elevenlabsConvId = conversationId;

  const activeCall = await prisma.call.findFirst({
    where: query,
    orderBy: { createdAt: 'desc' },
    select: { callerPhone: true },
  });
  if (activeCall?.callerPhone) return activeCall.callerPhone;

  // Fallback: fetch live from ElevenLabs API
  if (conversationId) {
    try {
      const conv = await elevenlabsService.getConversation(conversationId);
      return conv?.metadata?.phone_call?.external_number
        || conv?.metadata?.phone_call?.caller_id
        || null;
    } catch {
      return null;
    }
  }

  return null;
}

// ─── Public: POS payment return (Square / SumUp redirect after payment) ──────
// Square and SumUp redirect the customer's browser here after payment. We verify
// the payment with the provider API before marking the order/reservation confirmed.

export const posPaymentReturn = asyncHandler(async (req: Request, res: Response) => {
  const { order_id, reservation_id, provider } = req.query as Record<string, string>;
  const id = order_id || reservation_id;
  const type = order_id ? 'order' : 'reservation';

  if (!id || !provider) {
    return res.redirect(`${env.FRONTEND_URL}/#/payment-error`);
  }

  // Find the business and its integration config for the provider
  let business: any;
  let record: any;

  if (type === 'order') {
    record = await prisma.order.findUnique({
      where: { id },
      include: { business: { include: { integrations: true, notifSettings: true, user: true } } },
    });
    business = record?.business;
  } else {
    record = await prisma.reservation.findUnique({
      where: { id },
      include: { business: { include: { integrations: true, notifSettings: true, user: true } } },
    });
    business = record?.business;
  }

  if (!record || !business) {
    return res.redirect(`${env.FRONTEND_URL}/#/payment-error`);
  }

  const integration = business.integrations?.find(
    (i: any) => i.name === provider && i.status === 'CONNECTED',
  );
  if (!integration) {
    return res.redirect(`${env.FRONTEND_URL}/#/payment-error`);
  }

  const cfg = integration.config as any;
  let paid = false;

  if (provider === 'square') {
    paid = await paymentProviders.verifySquarePayment(cfg, id);
  } else if (provider === 'sumup') {
    paid = await paymentProviders.verifySumUpPayment(cfg, id);
  }

  if (!paid) {
    // Payment not yet confirmed — redirect to a pending page; customer may need to wait
    return res.redirect(`${env.FRONTEND_URL}/#/payment-pending?id=${id}&type=${type}`);
  }

  if (type === 'order') {
    await prisma.order.update({ where: { id }, data: { paymentStatus: 'paid', status: 'CONFIRMED' } });

    const amountPaid = Number(record.amount);
    const currency = business.currency || 'GBP';
    const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';

    // Customer SMS
    if (record.customerPhone && twilioService.isValidPhoneNumber(record.customerPhone)) {
      twilioService.sendSms(
        record.customerPhone,
        `Hi ${record.customerName}, your payment to ${business.name} is confirmed! Order #${id.slice(0, 8)} is being prepared.`,
      ).catch(() => {});
    }

    // Customer email
    if (record.customerEmail) {
      emailService.sendOrderPaymentConfirmation(
        record.customerEmail, record.customerName, business.name, record.id, record.items, amountPaid,
      ).catch(() => {});
    }

    // Push to KDS if Square/Clover is connected (even for DB-menu orders)
    const kdsIntegration = business.integrations?.find(
      (i: any) => ['Square', 'Clover'].includes(i.name) && i.status === 'CONNECTED',
    );
    if (kdsIntegration && !record.posOrderId) {
      try {
        const parsedItems = posService.parseItemString(record.items);
        const lineItems: posService.PosLineItem[] = parsedItems.map((p: any) => ({
          name: p.name, quantity: p.quantity, unitPriceMinor: 0,
        }));
        const posResult = await posService.pushOrderToPOS(kdsIntegration, {
          ourOrderId: record.id, customerName: record.customerName,
          customerPhone: record.customerPhone, orderType: record.type,
          deliveryAddress: record.deliveryAddress, notes: record.notes,
          allergies: record.allergies, lineItems, currency,
        });
        if (posResult) await prisma.order.update({ where: { id }, data: { posOrderId: posResult.posOrderId } });
      } catch (err) { console.error('[KDS] Post-payment push failed:', err); }
    }

    // Owner email
    const ownerEmail = business.email || business.user?.email;
    if (ownerEmail && business.notifSettings?.emailNewOrder !== false) {
      emailService.sendBusinessOrderPaymentReceived(
        ownerEmail, business.name, record.id, record.customerName, record.customerPhone, record.items, amountPaid,
      ).catch(() => {});
    }

    // Owner SMS (only if no KDS — KDS already alerts the kitchen)
    if (!kdsIntegration && business.phone && twilioService.isValidPhoneNumber(business.phone)) {
      twilioService.sendSms(
        business.phone,
        `[Talkativ] New order paid — ${record.customerName}, ${symbol}${amountPaid.toFixed(2)}, Order #${id.slice(0, 8)}: ${record.items}`,
      ).catch(() => {});
    }

    return res.redirect(`${env.FRONTEND_URL}/#/payment-success?order_id=${id}`);
  } else {
    await prisma.reservation.update({ where: { id }, data: { depositPaid: true, status: 'CONFIRMED' } });

    const depositPaid = Number(record.depositAmount);

    const resIntegration = business.integrations?.find(
      (i: any) => ['resOS', 'ResDiary', 'OpenTable', 'Collins'].includes(i.name) && i.status === 'CONNECTED',
    );
    if (resIntegration) {
      pushReservationToIntegration(resIntegration, id, {
        guestName: record.guestName,
        guestPhone: record.guestPhone,
        guests: record.guests,
        dateTime: record.dateTime.toISOString(),
        notes: `Deposit of £${depositPaid.toFixed(2)} paid via POS`,
      }).catch(() => {});
    }

    const formattedDate = record.dateTime.toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    if (record.guestPhone && twilioService.isValidPhoneNumber(record.guestPhone)) {
      twilioService.sendSms(
        record.guestPhone,
        `Hi ${record.guestName}, your deposit for ${business.name} on ${formattedDate} is confirmed! Booking ref: #${id.slice(0, 8)}`,
      ).catch(() => {});
    }

    if (record.guestEmail) {
      emailService.sendReservationDepositConfirmation(
        record.guestEmail,
        record.guestName,
        business.name,
        record.dateTime,
        record.guests,
        depositPaid,
        record.id,
      ).catch(err => console.error('[Email] Deposit confirm to guest failed:', err));
    }

    if (business.email && business.notifSettings?.emailNewReservation !== false) {
      emailService.sendBusinessDepositReceived(
        business.email,
        business.name,
        record.id,
        record.guestName,
        record.guestPhone,
        record.guests,
        record.dateTime,
        depositPaid,
      ).catch(err => console.error('[Email] Business deposit alert failed:', err));
    }

    return res.redirect(`${env.FRONTEND_URL}/#/payment-success?reservation_id=${id}`);
  }
});

// ─── ElevenLabs Webhook ──────────────────────────────────────────────────────
// ElevenLabs sends:
//   conversation_initiation_metadata — fires when a call starts
//   post_call_transcription          — fires after call ends (primary delivery)
// Both use { type: "...", data: { agent_id, conversation_id, ... } }
// Legacy field "event" also checked for backwards compat.
export const elevenlabsWebhook = asyncHandler(async (req: Request, res: Response) => {
  // Verify webhook secret — only accept the dedicated x-webhook-secret header
  const secret = req.headers['x-webhook-secret'];
  if (secret !== env.AGENT_WEBHOOK_SECRET) {
    throw ApiError.unauthorized('Invalid webhook secret');
  }

  const eventType: string = req.body.type || req.body.event || '';
  const data: any = req.body.data || {};

  // Helper: look up business from agent_id (ElevenLabs never sends business_id directly)
  const lookupBusiness = async (agentId: string | undefined) => {
    if (!agentId) return null;
    const agent = await prisma.agent.findFirst({ where: { elevenlabsAgentId: agentId } });
    return agent?.businessId ?? null;
  };

  // Helper: format ElevenLabs transcript array → readable "Role: text\n" string
  const formatTranscript = (raw: any): string | null => {
    if (!raw) return null;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
      return raw
        .map((t: any) => `${t.role === 'agent' ? 'Agent' : 'Caller'}: ${t.message || t.text || ''}`)
        .filter(Boolean)
        .join('\n');
    }
    return null;
  };

  if (
    eventType === 'conversation_initiation_metadata' ||
    eventType === 'conversation_initiation_client_data'
  ) {
    // Call just started — create a LIVE record so tools (create_order, etc.) can link to it
    const agentId = data.agent_id || req.body.agent_id;
    const businessId = await lookupBusiness(agentId);
    const convId = data.conversation_id || req.body.conversation_id || null;

    if (businessId) {
      const callerPhone =
        data.metadata?.phone_call?.external_number ||
        data.metadata?.phone_call?.caller_id ||
        data.caller_phone ||
        null;

      // Avoid duplicate LIVE records for the same conversation
      const existing = convId
        ? await prisma.call.findFirst({ where: { elevenlabsConvId: convId } })
        : null;

      if (!existing) {
        await prisma.call.create({
          data: {
            businessId,
            callerPhone,
            status: 'LIVE',
            elevenlabsConvId: convId,
            startedAt: new Date(),
          },
        });
      }
    }

    // ElevenLabs expects a specific response for conversation_initiation_client_data
    // (dynamic variables / config overrides). Return empty overrides — agent uses its defaults.
    if (eventType === 'conversation_initiation_client_data') {
      res.json({});
      return;
    }

  } else if (eventType === 'post_call_transcription' || eventType === 'conversation_ended') {
    // Call has ended — upsert the call record and retroactively link orders/reservations
    const convId: string | undefined = data.conversation_id;
    const businessId = await lookupBusiness(data.agent_id);
    if (!businessId) { res.json({ received: true }); return; }

    const callerPhone =
      data.metadata?.phone_call?.external_number ||
      data.metadata?.phone_call?.caller_id ||
      data.caller_phone ||
      null;
    const durationSecs: number | null =
      (data.metadata?.call_duration_secs != null ? Math.round(data.metadata.call_duration_secs) : null) ||
      (data.duration != null ? Math.round(data.duration) : null);
    const startedAt = data.metadata?.start_time_unix_secs
      ? new Date(data.metadata.start_time_unix_secs * 1000)
      : null;
    const callStatus = data.status === 'missed' ? 'MISSED' : 'COMPLETED';
    const transcript = formatTranscript(data.transcript);

    // Outcome fields may come from ElevenLabs data-collection or tool-call metadata
    const outcome: string | null = data.outcome || data.analysis?.transcript_summary || null;
    const validOutcomeTypes = ['ORDER', 'ENQUIRY', 'MISSED', 'RESERVATION'] as const;
    type OutcomeTypeEnum = typeof validOutcomeTypes[number];
    const rawOutcomeType = data.outcome_type || null;
    const outcomeType: OutcomeTypeEnum | null = rawOutcomeType && validOutcomeTypes.includes(rawOutcomeType as OutcomeTypeEnum)
      ? (rawOutcomeType as OutcomeTypeEnum)
      : null;

    let callId: string;

    const existing = convId
      ? await prisma.call.findFirst({ where: { elevenlabsConvId: convId } })
      : null;

    if (existing) {
      await prisma.call.update({
        where: { id: existing.id },
        data: {
          status: callStatus,
          duration: durationSecs,
          transcript,
          outcome,
          outcomeType,
          callerPhone: callerPhone || existing.callerPhone,
          endedAt: new Date(),
          ...(startedAt && !existing.startedAt ? { startedAt } : {}),
        },
      });
      callId = existing.id;
    } else {
      // No matching LIVE record — create from scratch using post-call data
      const created = await prisma.call.create({
        data: {
          businessId,
          callerPhone,
          elevenlabsConvId: convId || null,
          status: callStatus,
          duration: durationSecs,
          transcript,
          outcome,
          outcomeType,
          startedAt: startedAt || new Date(),
          endedAt: new Date(),
        },
      });
      callId = created.id;
    }

    // Retroactively link orders/reservations created during this call that have no
    // callId yet (happens when no LIVE record existed at tool-call time).
    // callId is @unique so update one row at a time.
    const callStart = startedAt || new Date(Date.now() - (durationSecs || 0) * 1000 - 5000);
    const orphanOrder = await prisma.order.findFirst({
      where: { businessId, callId: null, createdAt: { gte: callStart } },
      orderBy: { createdAt: 'asc' },
    });
    if (orphanOrder) {
      await prisma.order.update({ where: { id: orphanOrder.id }, data: { callId } });
    }
    const orphanRes = await prisma.reservation.findFirst({
      where: { businessId, callId: null, createdAt: { gte: callStart } },
      orderBy: { createdAt: 'asc' },
    });
    if (orphanRes) {
      await prisma.reservation.update({ where: { id: orphanRes.id }, data: { callId } });
    }
  }

  res.json({ received: true });
});

// ─── Stripe Webhook ──────────────────────────────────────────────────────────
export const stripeWebhook = asyncHandler(async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    throw ApiError.badRequest(`Webhook signature verification failed: ${err.message}`);
  }

  switch (event.type) {
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as any;
      const sub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: invoice.subscription } });
      if (sub) {
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE' } });
        await prisma.invoice.create({
          data: {
            subscriptionId: sub.id,
            stripeInvoiceId: invoice.id,
            amount: invoice.amount_paid / 100,
            status: 'paid',
            paidAt: new Date(),
            periodStart: new Date(invoice.period_start * 1000),
            periodEnd: new Date(invoice.period_end * 1000),
          },
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as any;
      const sub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: invoice.subscription } });
      if (sub) {
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as any;
      const sub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subscription.id } });
      if (sub) {
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } });
      }
      break;
    }

    case 'payment_intent.succeeded': {
      // Handle payment link completions (order payments & reservation deposits)
      const paymentIntent = event.data.object as any;
      const metadata = paymentIntent.metadata || {};

      if (metadata.type === 'order_payment' && metadata.order_id) {
        const order = await prisma.order.update({
          where: { id: metadata.order_id },
          data: { paymentStatus: 'paid', status: 'CONFIRMED' },
          include: { business: { include: { notifSettings: true } } },
        });

        const amountPaid = paymentIntent.amount / 100;

        // ── Send customer payment confirmation ────────────────────────────────
        if (order.customerPhone && twilioService.isValidPhoneNumber(order.customerPhone)) {
          // SMS confirmation
          twilioService.sendSms(
            order.customerPhone,
            `Hi ${order.customerName}, your payment of £${amountPaid.toFixed(2)} to ${order.business.name} is confirmed! Order #${order.id.slice(0, 8)} is being prepared.`,
          ).catch(err => console.error('[SMS] Order payment confirm failed:', err));
        }
        // Email confirmation (if customer email known)
        if (order.customerEmail) {
          emailService.sendOrderPaymentConfirmation(
            order.customerEmail,
            order.customerName,
            order.business.name,
            order.id,
            order.items,
            amountPaid,
          ).catch(err => console.error('[Email] Order payment confirm to customer failed:', err));
        }

        // ── Notify business that payment was received ─────────────────────────
        if (order.business.email && order.business.notifSettings?.emailNewOrder !== false) {
          emailService.sendBusinessOrderPaymentReceived(
            order.business.email,
            order.business.name,
            order.id,
            order.customerName,
            order.customerPhone,
            order.items,
            amountPaid,
          ).catch(err => console.error('[Email] Business order payment alert failed:', err));
        }

      } else if (metadata.type === 'reservation_deposit' && metadata.reservation_id) {
        const reservation = await prisma.reservation.update({
          where: { id: metadata.reservation_id },
          data: { depositPaid: true, status: 'CONFIRMED' },
          include: {
            business: { include: { notifSettings: true, integrations: true } },
          },
        });

        const depositPaid = paymentIntent.amount / 100;

        // ── Push to reservation platform now that deposit is confirmed ────────
        const resIntegration = reservation.business.integrations?.find(
          (i: any) => ['resOS', 'ResDiary', 'OpenTable', 'Collins'].includes(i.name) && i.status === 'CONNECTED',
        );
        if (resIntegration) {
          pushReservationToIntegration(resIntegration, reservation.id, {
            guestName: reservation.guestName,
            guestPhone: reservation.guestPhone,
            guests: reservation.guests,
            dateTime: reservation.dateTime.toISOString(),
            notes: `Deposit of £${depositPaid.toFixed(2)} paid via Talkativ`,
          }).catch(err => console.error('[Reservation] Post-deposit push failed:', err));
        }

        // ── SMS confirmation to guest ─────────────────────────────────────────
        const formattedDate = reservation.dateTime.toLocaleDateString('en-GB', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        if (reservation.guestPhone && twilioService.isValidPhoneNumber(reservation.guestPhone)) {
          twilioService.sendSms(
            reservation.guestPhone,
            `Hi ${reservation.guestName}, your deposit of £${depositPaid.toFixed(2)} for ${reservation.business.name} on ${formattedDate} is confirmed! Booking ref: #${reservation.id.slice(0, 8)}`,
          ).catch(err => console.error('[SMS] Deposit confirm failed:', err));
        }

        // ── Email confirmation to guest ───────────────────────────────────────
        if (reservation.guestEmail) {
          emailService.sendReservationDepositConfirmation(
            reservation.guestEmail,
            reservation.guestName,
            reservation.business.name,
            reservation.dateTime,
            reservation.guests,
            depositPaid,
            reservation.id,
          ).catch(err => console.error('[Email] Deposit confirm to guest failed:', err));
        }

        // ── Notify business that deposit was received ─────────────────────────
        if (reservation.business.email && reservation.business.notifSettings?.emailNewReservation !== false) {
          emailService.sendBusinessDepositReceived(
            reservation.business.email,
            reservation.business.name,
            reservation.id,
            reservation.guestName,
            reservation.guestPhone,
            reservation.guests,
            reservation.dateTime,
            depositPaid,
          ).catch(err => console.error('[Email] Business deposit alert failed:', err));
        }
      }
      break;
    }
  }

  res.json({ received: true });
});

// ─── Public Tool Endpoints (called by ElevenLabs during calls) ──────────────

export const catalogueLookup = asyncHandler(async (req: Request, res: Response) => {
  const { query, business_id } = req.body;

  // Check if the business has any menu items at all
  const totalItems = await prisma.menuItem.count({
    where: { category: { businessId: business_id }, status: 'ACTIVE' },
  });
  if (totalItems === 0) {
    res.json({
      items: [],
      message: "I'm sorry, our menu information isn't available right now. Please try again later or call us back during business hours.",
    });
    return;
  }

  const items = await prisma.menuItem.findMany({
    where: {
      category: { businessId: business_id },
      name: { contains: query, mode: 'insensitive' },
      status: 'ACTIVE',
    },
    select: { name: true, description: true, price: true },
    take: 10,
  });

  if (items.length === 0) {
    // Also try searching by category name
    const byCategory = await prisma.menuItem.findMany({
      where: {
        category: { businessId: business_id, name: { contains: query, mode: 'insensitive' } },
        status: 'ACTIVE',
      },
      select: { name: true, description: true, price: true },
      take: 10,
    });
    res.json({ items: byCategory });
    return;
  }

  res.json({ items });
});

// Haversine formula
function getDistanceFromLatLonInMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8; // Radius of the earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; // Distance in miles
}

// Normalise a UK postcode that may be missing the mid-space (e.g. "S12EL" → "S1 2EL")
function normaliseUKPostcode(raw: string): string {
  const cleaned = raw.replace(/\s+/g, '').toUpperCase();
  // The inward part is always exactly 3 chars: digit + 2 letters
  if (cleaned.length >= 5 && /\d[A-Z]{2}$/.test(cleaned)) {
    const inward = cleaned.slice(-3);
    const outward = cleaned.slice(0, -3);
    return `${outward} ${inward}`;
  }
  return raw;
}

const geocodePostalCode = async (postalCode: string) => {
  const normalised = normaliseUKPostcode(postalCode);
  try {
    const apiKey = env.GOOGLE_PLACES_API;
    if (!apiKey) {
      console.error("GOOGLE_PLACES_API key not configured");
      return null;
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(normalised)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (data.status === 'OK' && data.results?.length > 0) {
      const result = data.results[0];
      const { lat, lng } = result.geometry.location;
      return { lat, lon: lng, formatted: result.formatted_address };
    }
    if (data.status !== 'ZERO_RESULTS') {
      console.error("Geocoding error:", data.status, data.error_message);
    }
  } catch (e) {
    console.error("Geocoding error", e);
  }
  return null;
};

const verifyDeliveryEligibility = async (business: any, customer_postal_code: string) => {
  if (!business || !business.address) return { eligible: false, not_found: false, message: "Business address not configured." };

  const deliveryRadius = business.orderingPolicy?.deliveryRadius || 5;
  const unit = business.orderingPolicy?.deliveryRadiusUnit === 'km' ? 'km' : 'miles';

  // Use stored coordinates if available, otherwise geocode the business address as fallback
  let bizCoords: { lat: number; lon: number };
  if (business.lat != null && business.lng != null) {
    bizCoords = { lat: business.lat, lon: business.lng };
  } else {
    const bGeo = await geocodePostalCode(business.address);
    if (!bGeo) return { eligible: false, not_found: false, message: "Could not locate the restaurant. Delivery unavailable." };
    bizCoords = { lat: bGeo.lat, lon: bGeo.lon };
  }

  const custGeo = await geocodePostalCode(customer_postal_code);
  if (!custGeo) {
    return { eligible: false, not_found: true, message: "I couldn't find that postcode. Could you please repeat it?" };
  }

  const distanceMiles = getDistanceFromLatLonInMiles(bizCoords.lat, bizCoords.lon, custGeo.lat, custGeo.lon);

  if (unit === 'km') {
    const distanceKm = distanceMiles * 1.60934;
    if (distanceKm > deliveryRadius) {
      return {
        eligible: false,
        not_found: false,
        message: `I'm sorry, that postcode is ${distanceKm.toFixed(1)} km away and we only deliver within ${deliveryRadius} km. Unfortunately we can't deliver there.`,
      };
    }
  } else {
    if (distanceMiles > deliveryRadius) {
      return {
        eligible: false,
        not_found: false,
        message: `I'm sorry, that postcode is ${distanceMiles.toFixed(1)} miles away and we only deliver within ${deliveryRadius} miles. Unfortunately we can't deliver there.`,
      };
    }
  }

  return { eligible: true, not_found: false, formatted_address: custGeo.formatted };
};

export const checkDeliveryAddress = asyncHandler(async (req: Request, res: Response) => {
  const { business_id, customer_postal_code } = req.body;
  if (!business_id || !customer_postal_code) {
    res.json({ eligible: false, not_found: false, message: "Missing business_id or customer_postal_code." });
    return;
  }

  const business = await prisma.business.findUnique({
    where: { id: business_id },
    include: { orderingPolicy: true },
  });

  const eligibility = await verifyDeliveryEligibility(business, customer_postal_code);
  res.json(eligibility);
});

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const {
    business_id,
    customer_name,
    conversation_id,
    items,
    type,
    allergies,
    payment_method, // "pay_now" or "pay_on_delivery"/"pay_on_collection"
    notes,
    delivery_address,
  } = req.body;

  const customer_phone = await resolveCallerPhone(conversation_id, business_id, req.body.customer_phone);

  // Check business hours before accepting order
  const business = await prisma.business.findUnique({
    where: { id: business_id },
    include: { orderingPolicy: true, integrations: true, notifSettings: true, subscription: true },
  });
  if (!business) {
    res.json({ error: true, message: "I'm sorry, our ordering service isn't available right now. Kindly try again later." });
    return;
  }

  // Block if subscription is cancelled
  if ((business as any).subscription?.status === 'CANCELLED') {
    res.json({ error: true, message: "I'm sorry, our ordering service isn't available right now. Kindly try again later." });
    return;
  }

  // Hard block delivery orders missing an address
  if (type?.toUpperCase() === 'DELIVERY') {
    if (!delivery_address) {
      res.json({ error: true, message: 'Delivery address is required for delivery orders. Please ask the customer for their full address.' });
      return;
    }
    const eligibility = await verifyDeliveryEligibility(business, delivery_address);
    if (!eligibility.eligible) {
      res.json({ error: true, message: `Delivery address is invalid or out of allowed radius: ${eligibility.message}. Please inform the customer and offer collection instead.` });
      return;
    }
  }

  // Check if ordering integration is connected (Clover or Square)
  const orderingIntegration = business.integrations?.find(
    (i: any) => ['Clover', 'Square'].includes(i.name) && i.status === 'CONNECTED'
  );
  if (!orderingIntegration) {
    // No POS connected — check if we have any menu to take orders from
    const menuCount = await prisma.menuItem.count({
      where: { category: { businessId: business_id }, status: 'ACTIVE' },
    });
    if (menuCount === 0) {
      res.json({ error: true, message: "I'm sorry, our ordering service isn't available right now. Kindly try again later." });
      return;
    }
  }

  if (business.openingHours) {
    const now = new Date();
    // Hours stored as { is24h: "true"|"false", mon: "09:00-17:00", tue: "closed", ... }
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const hours = business.openingHours as Record<string, any>;
    const todayValue: string = hours[dayKeys[now.getDay()]] || '';
    const hoursStr = Object.entries(hours)
      .filter(([k, v]) => k !== 'is24h' && v !== 'closed')
      .map(([day, v]) => `${day}: ${v}`)
      .join(', ');

    let isClosed = false;
    if (hours.is24h === 'true') {
      isClosed = false; // open around the clock
    } else if (!todayValue || todayValue === 'closed') {
      isClosed = true;
    } else {
      // Parse "HH:MM-HH:MM" format
      const [openStr, closeStr] = todayValue.split('-');
      if (openStr && closeStr) {
        const [openH, openM] = openStr.split(':').map(Number);
        const [closeH, closeM] = closeStr.split(':').map(Number);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const openMinutes = openH * 60 + openM;
        const closeMinutes = closeH * 60 + closeM;
        if (nowMinutes < openMinutes || nowMinutes >= closeMinutes) {
          isClosed = true;
        }
      }
    }

    if (isClosed) {
      res.json({
        error: true,
        message: `Sorry, we're currently closed. Our opening hours are: ${hoursStr || 'not set'}. Please call back during business hours to place an order!`,
      });
      return;
    }
  }

  // Calculate amount from items (basic — in production, look up actual prices)
  let totalAmount = 0;
  if (typeof items === 'string') {
    // Try to parse from menu
    const itemNames = items.split(',').map((i: string) => i.trim());
    for (const rawName of itemNames) {
      // Strip leading quantity prefix like "2x " or "2 x " before looking up the item
      const itemName = rawName.replace(/^\d+\s*[xX]\s*/, '').trim();
      const menuItem = await prisma.menuItem.findFirst({
        where: {
          category: { businessId: business_id },
          name: { contains: itemName, mode: 'insensitive' },
          status: 'ACTIVE',
        },
      });
      if (menuItem) {
        // Parse quantity from prefix (e.g. "2x Edikaikong" → qty 2), default 1
        const qtyMatch = rawName.match(/^(\d+)\s*[xX]\s*/);
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
        totalAmount += Number(menuItem.price) * qty;
      }
    }
  }

  const orderType = type?.toUpperCase() || 'DELIVERY';
  let deliveryFee = 0;
  if (orderType === 'DELIVERY' && business.orderingPolicy?.deliveryFee) {
    deliveryFee = Number(business.orderingPolicy.deliveryFee);
    totalAmount += deliveryFee;
  }

  // Find the most recent LIVE call for this business to link it
  const activeCall = await prisma.call.findFirst({
    where: { businessId: business_id, status: 'LIVE' },
    orderBy: { createdAt: 'desc' },
  });

  const order = await prisma.order.create({
    data: {
      businessId: business_id,
      callId: activeCall?.id || null,
      customerName: customer_name,
      customerPhone: customer_phone || null,
      deliveryAddress: delivery_address || null,
      items: items,
      type: orderType as any,
      amount: totalAmount,
      allergies: allergies || null,
      notes: notes || null,
      paymentMethod: payment_method || 'pay_on_delivery',
      paymentStatus: 'pending',
      status: 'PENDING',
    },
  });

  // Update call outcome type to ORDER
  if (activeCall) {
    await prisma.call.update({
      where: { id: activeCall.id },
      data: { outcomeType: 'ORDER', outcome: `Order #${order.id.slice(0, 8)}` },
    });
  }

  // ── Push order to POS (Clover / Square) if integration is connected ──────────
  if (orderingIntegration) {
    try {
      const parsedItems = posService.parseItemString(items);
      // Resolve prices from DB for each item
      const lineItems: posService.PosLineItem[] = [];
      for (const parsed of parsedItems) {
        const menuItem = await prisma.menuItem.findFirst({
          where: { category: { businessId: business_id }, name: { contains: parsed.name, mode: 'insensitive' }, status: 'ACTIVE' },
        });
        lineItems.push({
          name: parsed.name,
          quantity: parsed.quantity,
          unitPriceMinor: menuItem ? Math.round(Number(menuItem.price) * 100) : 0,
        });
      }

      const posResult = await posService.pushOrderToPOS(orderingIntegration, {
        ourOrderId: order.id,
        customerName: customer_name,
        customerPhone: customer_phone || null,
        orderType: orderType as 'DELIVERY' | 'COLLECTION',
        deliveryAddress: delivery_address || null,
        notes: notes || null,
        allergies: allergies || null,
        lineItems,
        currency: (business as any).currency || 'GBP',
      });

      if (posResult) {
        await prisma.order.update({ where: { id: order.id }, data: { posOrderId: posResult.posOrderId } });
        console.log(`[POS] Order pushed to ${posResult.posSystem} — POS ID: ${posResult.posOrderId}`);
      }
    } catch (posErr) {
      // Non-fatal — order is saved in our DB, POS push is best-effort
      console.error('[POS] Failed to push order to POS:', posErr);
    }
  }

  let paymentLink: string | null = null;
  let paymentLinkSent = false;

  // ── Payment routing ─────────────────────────────────────────────────────────
  // Priority: isPrimary integration first, then Square → Clover → SumUp → Zettle → Stripe
  const PAYMENT_PROVIDERS = ['Square', 'Clover', 'SumUp', 'Zettle', 'Stripe'];
  const connectedPaymentIntegrations = business.integrations?.filter(
    (i: any) => PAYMENT_PROVIDERS.includes(i.name) && i.status === 'CONNECTED'
  ) || [];
  const primaryPayInt = connectedPaymentIntegrations.find((i: any) => i.isPrimary)
    || connectedPaymentIntegrations.sort((a: any, b: any) =>
        PAYMENT_PROVIDERS.indexOf(a.name) - PAYMENT_PROVIDERS.indexOf(b.name)
      )[0]
    || null;

  if (payment_method === 'pay_now' && totalAmount > 0 && !primaryPayInt) {
    // No payment integration — refuse the order
    await prisma.order.delete({ where: { id: order.id } });
    res.json({ error: true, message: "I'm sorry, we're not set up to take phone payments right now. Please visit us in person or try again later." });
    return;
  }

  if (payment_method === 'pay_now' && totalAmount > 0 && customer_phone && primaryPayInt) {
    try {
      const businessCurrency = ((business as any).currency || 'GBP').toUpperCase();
      const cfg = primaryPayInt.config as any;
      let providerName = primaryPayInt.name;

      if (primaryPayInt.name === 'Square') {
        paymentLink = await paymentProviders.createSquarePaymentLink(cfg, order.id, items, totalAmount, businessCurrency);
      } else if (primaryPayInt.name === 'Clover') {
        // Clover doesn't have a hosted payment link — fall through to Stripe if available
        const fallbackStripe = connectedPaymentIntegrations.find((i: any) => i.name === 'Stripe');
        if (fallbackStripe) {
          const sCfg = fallbackStripe.config as any;
          const pi = await stripeService.createPaymentIntentWithConnect(
            Math.round(totalAmount * 100), businessCurrency.toLowerCase(),
            { type: 'order_payment', order_id: order.id, business_id, customer_name }, sCfg.accountId,
          );
          await prisma.order.update({ where: { id: order.id }, data: { paymentIntentId: pi.id } });
          paymentLink = `${env.FRONTEND_URL}/#/pay?pi=${pi.client_secret}&order_id=${order.id}&type=order`;
          providerName = 'Stripe';
        }
      } else if (primaryPayInt.name === 'SumUp') {
        paymentLink = await paymentProviders.createSumUpCheckout(cfg, order.id, items, totalAmount, businessCurrency);
      } else if (primaryPayInt.name === 'Zettle') {
        // Zettle is in-person only — no hosted link; fall through to Stripe
        const fallbackStripe = connectedPaymentIntegrations.find((i: any) => i.name === 'Stripe');
        if (fallbackStripe) {
          const sCfg = fallbackStripe.config as any;
          const pi = await stripeService.createPaymentIntentWithConnect(
            Math.round(totalAmount * 100), businessCurrency.toLowerCase(),
            { type: 'order_payment', order_id: order.id, business_id, customer_name }, sCfg.accountId,
          );
          await prisma.order.update({ where: { id: order.id }, data: { paymentIntentId: pi.id } });
          paymentLink = `${env.FRONTEND_URL}/#/pay?pi=${pi.client_secret}&order_id=${order.id}&type=order`;
          providerName = 'Stripe';
        }
      } else if (primaryPayInt.name === 'Stripe') {
        const pi = await stripeService.createPaymentIntentWithConnect(
          Math.round(totalAmount * 100), businessCurrency.toLowerCase(),
          { type: 'order_payment', order_id: order.id, business_id, customer_name }, cfg.accountId,
        );
        await prisma.order.update({ where: { id: order.id }, data: { paymentIntentId: pi.id } });
        paymentLink = `${env.FRONTEND_URL}/#/pay?pi=${pi.client_secret}&order_id=${order.id}&type=order`;
      }

      if (paymentLink) {
        await prisma.order.update({ where: { id: order.id }, data: { paymentLinkUrl: paymentLink, paymentProvider: providerName } });
        if (customer_phone && twilioService.isValidPhoneNumber(customer_phone)) {
          const currency = (business as any).currency || 'GBP';
          const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
          const smsBody = `Hi ${customer_name}, here is your payment link for your order at ${business.name}:\n\nTotal: ${symbol}${totalAmount.toFixed(2)}\nItems: ${items}\n\nPay here: ${paymentLink}`;
          twilioService.sendSms(customer_phone, smsBody).catch(err => console.error('[SMS] Failed to send payment link:', err));
          paymentLinkSent = true;
        }
      }
    } catch (payErr) {
      console.error('[Payment] Failed to create payment link:', payErr);
    }
  } else if (customer_phone && twilioService.isValidPhoneNumber(customer_phone)) {
    // Send order confirmation SMS for pay on delivery/collection
    const smsBody = `Hi ${customer_name}, your order at ${business.name} is confirmed!\n\nItems: ${items}${deliveryFee > 0 ? `\nDelivery fee: £${deliveryFee.toFixed(2)}` : ''}\nTotal: £${totalAmount.toFixed(2)}\nPayment: on ${orderType === 'DELIVERY' ? 'delivery' : 'collection'}${allergies ? `\n\n⚠️ Allergies noted: ${allergies}` : ''}`;
    twilioService.sendSms(customer_phone, smsBody).catch(err => console.error('[SMS] Failed to send order confirmation:', err));
  }

  // Build allergy warning for staff
  const allergyWarning = allergies
    ? `\n⚠️ ALLERGY ALERT: Customer has reported the following allergies: ${allergies}. Please ensure all items are safe and inform kitchen staff.`
    : '';

  // Send business notification email
  if (business.notifSettings?.emailNewOrder !== false && business.email) {
    emailService.sendBusinessNewOrderAlert(business.email, business.name, {
      id: order.id,
      type: order.type,
      customerName: customer_name,
      customerPhone: customer_phone,
      deliveryAddress: delivery_address,
      items: items,
      notes: notes,
      allergies: allergies,
      subtotal: totalAmount - deliveryFee,
      deliveryFee: deliveryFee,
      total: totalAmount,
      paymentMethod: payment_method || 'pay_on_delivery',
      paymentStatus: 'pending'
    }).catch(err => console.error('Failed to send business new order alert:', err));
  }

  res.json({
    order_id: order.id,
    confirmation: `Order created successfully!${allergyWarning}`,
    allergies: allergies || null,
    payment_method: payment_method || 'pay_on_delivery',
    payment_link: paymentLink,
    payment_link_sent: paymentLinkSent,
    payment_note: !paymentLinkSent && payment_method === 'pay_now'
      ? 'No payment integration is connected — a payment link could not be sent. Tell the customer their order is confirmed and payment will be collected on delivery or collection instead.'
      : undefined,
    total: totalAmount,
  });
});

// ─── Helper: generate unique Talkativ reference (TLK-XXXX) ───────────────────
const generateTalkativRef = async (): Promise<string> => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const ref = `TLK-${crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4)}`;
    const exists = await prisma.reservation.findUnique({ where: { talkativRef: ref } });
    if (!exists) return ref;
  }
  return `TLK-${Date.now().toString(36).toUpperCase().slice(-4)}`;
};

// ─── Check Availability (agent tool) ──────────────────────────────────────────
export const checkAvailability = asyncHandler(async (req: Request, res: Response) => {
  const { business_id, date, time, guests } = req.body;

  if (!business_id || !date || !time || !guests) {
    res.json({ error: true, message: 'business_id, date, time, and guests are required.' });
    return;
  }

  const business = await prisma.business.findUnique({
    where: { id: business_id },
    include: { reservationPolicy: true, integrations: true },
  });

  if (!business || !business.reservationPolicy?.reservationsEnabled) {
    res.json({ available: false, message: "Reservations are not currently available." });
    return;
  }

  const partySize = Number(guests);
  if (partySize > (business.reservationPolicy.maxPartySize || 20)) {
    res.json({
      available: false,
      message: `Sorry, the maximum party size we accept is ${business.reservationPolicy.maxPartySize}. Would you like to book for a smaller group?`,
    });
    return;
  }

  const reservationIntegration = (business.integrations || []).find(
    (i: any) => ['resOS', 'ResDiary'].includes(i.name) && i.status === 'CONNECTED',
  );

  if (!reservationIntegration?.config) {
    // No integration — check basic opening hours only
    res.json({ available: true, slots: [{ time, available: true }], message: `${date} at ${time} for ${partySize} guests is available.` });
    return;
  }

  const cfg = reservationIntegration.config as Record<string, string>;

  if (reservationIntegration.name === 'resOS' && cfg.apiKey && cfg.propertyId) {
    const result = await resosService.checkResOSAvailability(cfg.apiKey, cfg.propertyId, date, time, partySize);
    if (!result.available && result.slots.length === 0) {
      res.json({ available: false, slots: [], message: `Unfortunately ${time} on ${date} for ${partySize} guests is not available. There are no alternative slots at this time.` });
      return;
    }
    const slotTimes = result.slots.slice(0, 4).map(s => s.time).join(', ');
    res.json({
      available: result.available,
      slots: result.slots,
      message: result.available
        ? `${date} at ${time} for ${partySize} guests is available.`
        : `${time} on ${date} is unavailable for ${partySize} guests, but these times are open: ${slotTimes}. Which would you prefer?`,
    });
    return;
  }

  // ResDiary — no availability API, assume available
  res.json({ available: true, slots: [{ time, available: true }], message: `${date} at ${time} for ${partySize} guests is available.` });
});

export const createReservation = asyncHandler(async (req: Request, res: Response) => {
  const {
    business_id,
    guest_name,
    conversation_id,
    guests,
    date_time,
  } = req.body;

  const guest_phone = await resolveCallerPhone(conversation_id, business_id, req.body.guest_phone);

  // Check business hours before accepting reservation
  const business = await prisma.business.findUnique({
    where: { id: business_id },
    include: { reservationPolicy: true, integrations: true, notifSettings: true, subscription: true },
  });
  if (!business) {
    res.json({ error: true, message: "I'm sorry, our reservation service isn't available right now. Kindly try again later." });
    return;
  }

  // Block if subscription is cancelled
  if ((business as any).subscription?.status === 'CANCELLED') {
    res.json({ error: true, message: "I'm sorry, our reservation service isn't available right now. Kindly try again later." });
    return;
  }

  // Block if reservations have not been enabled by the business owner
  if (!business.reservationPolicy?.reservationsEnabled) {
    res.json({ error: true, message: "I'm sorry, we're not currently accepting reservations. Please call back or visit us in person to make a booking." });
    return;
  }

  // Find the first connected reservation integration (resOS, ResDiary, OpenTable, Collins)
  const reservationIntegration = business.integrations?.find(
    (i: any) => ['resOS', 'ResDiary', 'OpenTable', 'Collins'].includes(i.name) && i.status === 'CONNECTED'
  );
  // No block — reservations work without any integration. The integration is for syncing only.

  if (business.openingHours) {
    const reservationDate = new Date(date_time);
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const hours = business.openingHours as Record<string, any>;
    const dayKey = dayKeys[reservationDate.getDay()];
    const dayLabel = dayLabels[reservationDate.getDay()];
    const dayValue: string = hours[dayKey] || '';
    const hoursStr = Object.entries(hours)
      .filter(([k, v]) => k !== 'is24h' && v !== 'closed')
      .map(([day, v]) => `${day}: ${v}`)
      .join(', ');

    let isUnavailable = false;
    if (hours.is24h === 'true') {
      isUnavailable = false;
    } else if (!dayValue || dayValue === 'closed') {
      isUnavailable = true;
    } else {
      const [openStr, closeStr] = dayValue.split('-');
      if (openStr && closeStr) {
        const [openH, openM] = openStr.split(':').map(Number);
        const [closeH, closeM] = closeStr.split(':').map(Number);
        const reservationMinutes = reservationDate.getHours() * 60 + reservationDate.getMinutes();
        const openMinutes = openH * 60 + openM;
        const closeMinutes = closeH * 60 + closeM;
        if (reservationMinutes < openMinutes || reservationMinutes >= closeMinutes) {
          isUnavailable = true;
        }
      }
    }

    if (isUnavailable) {
      res.json({
        error: true,
        message: `Sorry, we're not available on ${dayLabel} at that time. Our opening hours are: ${hoursStr || 'not set'}. Would you like to book for a different day or time?`,
      });
      return;
    }
  }

  // Check if deposit is required based on business reservation policy
  const depositRequired = business.reservationPolicy?.depositRequired || false;
  const depositAmount = business.reservationPolicy?.depositAmount || 0;
  const depositType = business.reservationPolicy?.depositType || 'PER_GUEST';

  // Calculate actual deposit amount
  let actualDeposit = 0;
  if (depositRequired && depositAmount > 0) {
    if (depositType === 'PER_GUEST') {
      actualDeposit = depositAmount * guests;
    } else if (depositType === 'PER_TABLE') {
      actualDeposit = depositAmount;
    } else {
      actualDeposit = depositAmount; // FIXED
    }
  }

  // Find the most recent LIVE call for this business to link it
  const activeCall = await prisma.call.findFirst({
    where: { businessId: business_id, status: 'LIVE' },
    orderBy: { createdAt: 'desc' },
  });

  const talkativRef = await generateTalkativRef();

  const reservation = await prisma.reservation.create({
    data: {
      businessId: business_id,
      callId: activeCall?.id || null,
      guestName: guest_name,
      guestPhone: guest_phone || null,
      guests,
      dateTime: new Date(date_time),
      status: 'PENDING',
      depositRequired,
      depositAmount: actualDeposit,
      talkativRef,
    },
  });

  // Update call outcome type to RESERVATION
  if (activeCall) {
    await prisma.call.update({
      where: { id: activeCall.id },
      data: { outcomeType: 'RESERVATION', outcome: `Reservation #${reservation.id.slice(0, 8)}` },
    });
  }

  let paymentLink = null;
  const formattedDate = new Date(date_time).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  // ── Deposit payment routing: Square → SumUp → Stripe Connect → nothing ──────
  if (depositRequired && actualDeposit > 0 && guest_phone) {
    try {
      const businessCurrency = ((business as any).currency || 'GBP').toUpperCase();
      const squareInt = business.integrations?.find((i: any) => i.name === 'Square' && i.status === 'CONNECTED');
      const sumupInt  = business.integrations?.find((i: any) => i.name === 'SumUp'  && i.status === 'CONNECTED');
      const stripeInt = business.integrations?.find((i: any) => i.name === 'Stripe' && i.status === 'CONNECTED');

      if (squareInt) {
        const cfg = squareInt.config as any;
        paymentLink = await paymentProviders.createSquarePaymentLink(
          cfg, reservation.id, `Deposit for ${guests} guests at ${business.name}`, actualDeposit, businessCurrency,
        );
      } else if (sumupInt) {
        const cfg = sumupInt.config as any;
        paymentLink = await paymentProviders.createSumUpCheckout(
          cfg, reservation.id, `Deposit for ${guests} guests at ${business.name}`, actualDeposit, businessCurrency,
        );
      } else if (stripeInt) {
        const cfg = stripeInt.config as any;
        const paymentIntent = await stripeService.createPaymentIntentWithConnect(
          Math.round(actualDeposit * 100),
          businessCurrency.toLowerCase(),
          { type: 'reservation_deposit', reservation_id: reservation.id, business_id, guest_name },
          cfg.accountId,
        );
        await prisma.reservation.update({ where: { id: reservation.id }, data: { depositPaymentIntentId: paymentIntent.id } });
        paymentLink = `${env.FRONTEND_URL}/#/pay?pi=${paymentIntent.client_secret}&reservation_id=${reservation.id}&type=reservation`;
      }

      if (paymentLink && twilioService.isValidPhoneNumber(guest_phone)) {
        const smsBody = `Hi ${guest_name}, your table for ${guests} at ${business.name} on ${formattedDate} is almost confirmed!\n\nBooking ref: ${talkativRef}\nA deposit of £${actualDeposit.toFixed(2)} is required. Pay here: ${paymentLink}\n\nFull payment due at the venue.`;
        twilioService.sendSms(guest_phone, smsBody).catch(err => console.error('[SMS] Failed to send deposit link:', err));
      }
    } catch (payErr) {
      console.error('[Payment] Failed to create deposit payment link:', payErr);
    }
  } else if (guest_phone && twilioService.isValidPhoneNumber(guest_phone)) {
    // No deposit — send booking confirmation SMS
    const smsBody = `Hi ${guest_name}, your reservation for ${guests} guest${guests > 1 ? 's' : ''} at ${business.name} on ${formattedDate} is confirmed!\n\nBooking ref: ${talkativRef}\nFull payment due at the venue.`;
    twilioService.sendSms(guest_phone, smsBody).catch(err => console.error('[SMS] Failed to send reservation confirmation:', err));
  }

  // Build response with deposit info
  let depositMessage = '';
  if (depositRequired && actualDeposit > 0) {
    depositMessage = ` A deposit of £${actualDeposit.toFixed(2)} is required.`;
    if (guest_phone) {
      depositMessage += ` We've sent a payment link to their phone.`;
    }
  }

  // ── Push to reservation platform if connected ─────────────────────────────
  // Deferred when a deposit is required — push happens after payment is confirmed.
  if (reservationIntegration && !(depositRequired && actualDeposit > 0)) {
    await pushReservationToIntegration(reservationIntegration, reservation.id, {
      guestName: guest_name,
      guestPhone: guest_phone || null,
      guests,
      dateTime: date_time,
      notes: depositMessage || null,
    });
  } else if (depositRequired && actualDeposit > 0) {
    console.log(`[Reservation] Deposit required — deferring platform push until deposit is paid.`);
  }

  // Send business notification email
  if (business.notifSettings?.emailNewReservation !== false && business.email) {
    emailService.sendBusinessNewReservationAlert(business.email, business.name, {
      id: reservation.id,
      guestName: guest_name,
      guestPhone: guest_phone,
      guests: guests,
      dateTime: new Date(date_time),
      depositStatus: (depositRequired && actualDeposit > 0) ? 'Pending payment' : 'No deposit required'
    }).catch(err => console.error('Failed to send business reservation alert:', err));
  }

  res.json({
    reservation_id: reservation.id,
    talkativ_ref: talkativRef,
    confirmation: `Reservation created successfully! Booking reference: ${talkativRef}.${depositMessage} Full payment is due at the venue.`,
    deposit_required: depositRequired,
    deposit_amount: actualDeposit,
    payment_link: paymentLink,
  });
});

export const checkHours = asyncHandler(async (req: Request, res: Response) => {
  const { business_id } = req.body;
  const business = await prisma.business.findUnique({ where: { id: business_id } });
  if (!business) throw ApiError.notFound('Business not found');
  res.json({ hours: business.openingHours || 'Hours not set' });
});

// ─── Cancel Reservation (agent tool) ─────────────────────────────────────────
// Called by ElevenLabs agent when a caller wants to cancel their reservation.
// ─── Get Reservation (agent tool) ─────────────────────────────────────────────
export const getReservation = asyncHandler(async (req: Request, res: Response) => {
  const { talkativ_ref, reservation_id, business_id, conversation_id } = req.body;
  const guest_phone = await resolveCallerPhone(conversation_id, business_id, req.body.guest_phone);

  if (!talkativ_ref && !reservation_id && !guest_phone) {
    res.json({ error: true, message: 'Please provide the booking reference (e.g. TLK-XXXX) or phone number.' });
    return;
  }

  const reservation = await prisma.reservation.findFirst({
    where: {
      businessId: business_id,
      status: { not: 'CANCELLED' },
      ...(talkativ_ref ? { talkativRef: talkativ_ref } : reservation_id ? { id: reservation_id } : { guestPhone: guest_phone }),
    },
    include: { business: { include: { reservationPolicy: true } } },
    orderBy: { createdAt: 'desc' },
  });

  if (!reservation) {
    res.json({ error: true, message: "I couldn't find an active reservation with those details. Please double-check the reference or phone number." });
    return;
  }

  const formattedDate = reservation.dateTime.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  res.json({
    found: true,
    reservation_id: reservation.id,
    talkativ_ref: reservation.talkativRef,
    guest_name: reservation.guestName,
    guests: reservation.guests,
    date_time: reservation.dateTime.toISOString(),
    formatted_date: formattedDate,
    status: reservation.status,
    deposit_paid: reservation.depositPaid,
    deposit_amount: Number(reservation.depositAmount ?? 0),
    note: reservation.note,
    cancellation_hours: (reservation.business as any).reservationPolicy?.cancellationHours ?? 24,
    refund_percentage: (reservation.business as any).reservationPolicy?.refundPercentage ?? 100,
  });
});

export const cancelReservation = asyncHandler(async (req: Request, res: Response) => {
  const { reservation_id, talkativ_ref, business_id, conversation_id } = req.body;
  const guest_phone = await resolveCallerPhone(conversation_id, business_id, req.body.guest_phone);

  if (!reservation_id && !talkativ_ref && !guest_phone) {
    res.json({ error: true, message: 'Please provide the booking reference (e.g. TLK-XXXX) or the phone number used when booking.' });
    return;
  }

  // Look up by talkativRef first, then UUID, then phone
  const reservation = await prisma.reservation.findFirst({
    where: {
      businessId: business_id,
      status: { not: 'CANCELLED' },
      ...(talkativ_ref ? { talkativRef: talkativ_ref } : reservation_id ? { id: reservation_id } : { guestPhone: guest_phone }),
    },
    include: {
      business: { include: { integrations: true, notifSettings: true, reservationPolicy: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!reservation) {
    res.json({ error: true, message: "I couldn't find an active reservation with those details. Please double-check the booking reference or phone number." });
    return;
  }

  // Cancel in our DB
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: { status: 'CANCELLED' },
  });

  // Cancel in resOS if linked
  if (reservation.externalId) {
    const resosIntegration = reservation.business.integrations?.find(
      (i: any) => i.name === 'resOS' && i.status === 'CONNECTED',
    );
    if (resosIntegration) {
      const cfg = resosIntegration.config as any;
      if (cfg?.apiKey && cfg?.propertyId) {
        resosService.cancelResOSReservation(cfg.apiKey, cfg.propertyId, reservation.externalId)
          .catch(err => console.error('[resOS] Cancel failed:', err));
      }
    }
  }

  const formattedDate = reservation.dateTime.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const ref = reservation.talkativRef || `#${reservation.id.slice(0, 8)}`;
  const depositAmountNum = Number(reservation.depositAmount ?? 0);
  const depositPaid = reservation.depositPaid && depositAmountNum > 0;

  // Check cancellation policy for refund eligibility
  const cancellationHours = (reservation.business as any).reservationPolicy?.cancellationHours ?? 24;
  const refundPct = (reservation.business as any).reservationPolicy?.refundPercentage ?? 100;
  const hoursUntilBooking = (reservation.dateTime.getTime() - Date.now()) / 3_600_000;
  const refundEligible = depositPaid && hoursUntilBooking >= cancellationHours;
  const refundAmount = refundEligible ? (depositAmountNum * refundPct) / 100 : 0;

  // SMS to guest
  if (reservation.guestPhone) {
    const depositMsg = depositPaid
      ? refundEligible
        ? ` A refund of £${refundAmount.toFixed(2)} will be processed by the business.`
        : ` Per the cancellation policy, the deposit of £${depositAmountNum.toFixed(2)} is non-refundable.`
      : '';
    twilioService.sendSms(
      reservation.guestPhone,
      `Hi ${reservation.guestName}, your reservation at ${reservation.business.name} on ${formattedDate} has been cancelled. Ref: ${ref}.${depositMsg}`,
    ).catch(err => console.error('[SMS] Cancellation confirm failed:', err));
  }

  // Email to guest
  if (reservation.guestEmail) {
    emailService.sendReservationCancellationToGuest(
      reservation.guestEmail,
      reservation.guestName,
      reservation.business.name,
      reservation.dateTime,
      reservation.id,
    ).catch(() => {});
  }

  // Notify business owner via email AND SMS
  if (reservation.business.email) {
    const refundLine = depositPaid
      ? refundEligible
        ? `A refund of £${refundAmount.toFixed(2)} (${refundPct}%) is owed — please process manually.`
        : `Deposit of £${depositAmountNum.toFixed(2)} is non-refundable per cancellation policy.`
      : 'No deposit was paid.';

    emailService.sendBusinessReservationCancelled(
      reservation.business.email,
      reservation.business.name,
      reservation.id,
      reservation.guestName,
      reservation.guestPhone,
      reservation.dateTime,
    ).catch(() => {});

    // SMS to business owner phone
    const bizPhone = (reservation.business as any).phone;
    if (bizPhone && twilioService.isValidPhoneNumber(bizPhone)) {
      twilioService.sendSms(
        bizPhone,
        `[Talkativ] Reservation cancelled — ${reservation.guestName}, ${reservation.guests} guests, ${formattedDate}. Ref: ${ref}. ${refundLine}`,
      ).catch(err => console.error('[SMS] Business cancel notify failed:', err));
    }
  }

  let depositNote = '';
  if (depositPaid) {
    depositNote = refundEligible
      ? ` A refund of £${refundAmount.toFixed(2)} is owed — the business has been notified to process it manually.`
      : ` Per the cancellation policy, the deposit is non-refundable for cancellations within ${cancellationHours} hours of the booking.`;
  }

  res.json({
    success: true,
    reservation_id: reservation.id,
    talkativ_ref: ref,
    confirmation: `Reservation for ${reservation.guestName} on ${formattedDate} has been cancelled.${depositNote}`,
  });
});

// ─── Update Reservation (agent tool) ──────────────────────────────────────────
// Called by ElevenLabs agent when a caller wants to change date/time or party size.
export const updateReservation = asyncHandler(async (req: Request, res: Response) => {
  const { reservation_id, talkativ_ref, business_id, conversation_id, new_date_time, new_guests } = req.body;
  const guest_phone = await resolveCallerPhone(conversation_id, business_id, req.body.guest_phone);

  if (!reservation_id && !talkativ_ref && !guest_phone) {
    res.json({ error: true, message: 'Please provide the booking reference (e.g. TLK-XXXX) or the phone number used when booking.' });
    return;
  }

  if (!new_date_time && !new_guests) {
    res.json({ error: true, message: 'Please specify what you would like to change — the date/time or the number of guests.' });
    return;
  }

  const reservation = await prisma.reservation.findFirst({
    where: {
      businessId: business_id,
      status: { not: 'CANCELLED' },
      ...(talkativ_ref ? { talkativRef: talkativ_ref } : reservation_id ? { id: reservation_id } : { guestPhone: guest_phone }),
    },
    include: {
      business: { include: { integrations: true, notifSettings: true, reservationPolicy: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!reservation) {
    res.json({ error: true, message: "I couldn't find an active reservation with those details. Please double-check the booking reference or phone number." });
    return;
  }

  const newGuests = new_guests ? Number(new_guests) : null;

  // Validate new date against opening hours
  if (new_date_time && reservation.business.openingHours) {
    const newDate = new Date(new_date_time);
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const hours = reservation.business.openingHours as Record<string, any>;
    const dayKey = dayKeys[newDate.getDay()];
    const dayLabel = dayLabels[newDate.getDay()];
    const dayValue: string = hours[dayKey] || '';
    if (hours.is24h !== 'true' && (!dayValue || dayValue === 'closed')) {
      res.json({ error: true, message: `Sorry, we're closed on ${dayLabel}. Please choose a different day.` });
      return;
    }
  }

  // Check availability in integration if party size or time changes
  const reservationIntegration = (reservation.business.integrations || []).find(
    (i: any) => ['resOS', 'ResDiary'].includes(i.name) && i.status === 'CONNECTED',
  );
  if (reservationIntegration?.config && (new_date_time || newGuests)) {
    const cfg = reservationIntegration.config as Record<string, string>;
    const checkDate = new_date_time
      ? new Date(new_date_time).toISOString().slice(0, 10)
      : reservation.dateTime.toISOString().slice(0, 10);
    const checkTime = new_date_time
      ? new Date(new_date_time).toTimeString().slice(0, 5)
      : reservation.dateTime.toTimeString().slice(0, 5);
    const checkGuests = newGuests || reservation.guests;

    if (reservationIntegration.name === 'resOS' && cfg.apiKey && cfg.propertyId) {
      const avail = await resosService.checkResOSAvailability(cfg.apiKey, cfg.propertyId, checkDate, checkTime, checkGuests);
      if (!avail.available) {
        const altTimes = avail.slots.slice(0, 3).map(s => s.time).join(', ');
        res.json({
          error: true,
          available: false,
          alternative_slots: avail.slots,
          message: altTimes
            ? `${checkTime} on ${checkDate} for ${checkGuests} guests is not available. Available times: ${altTimes}. Would you like one of those, keep your current booking, or cancel?`
            : `${checkTime} on ${checkDate} for ${checkGuests} guests is not available. Would you like to keep your current booking or cancel?`,
        });
        return;
      }
    }
  }

  // Calculate deposit difference if party size changes (per_guest type only)
  let depositDiff = 0;
  let newDepositTotal = Number(reservation.depositAmount ?? 0);
  const resPol = (reservation.business as any).reservationPolicy;
  if (newGuests && resPol?.depositRequired && resPol.depositType === 'PER_GUEST' && resPol.depositAmount > 0) {
    newDepositTotal = resPol.depositAmount * newGuests;
    depositDiff = newDepositTotal - Number(reservation.depositAmount ?? 0);
  }

  const updatedData: any = {};
  if (new_date_time) updatedData.dateTime = new Date(new_date_time);
  if (newGuests) updatedData.guests = newGuests;
  if (depositDiff > 0) updatedData.depositAmount = newDepositTotal;

  await prisma.reservation.update({ where: { id: reservation.id }, data: updatedData });

  // Handle additional deposit payment if needed
  let depositPaymentLink: string | null = null;
  if (depositDiff > 0 && reservation.guestPhone && depositDiff > 0.01) {
    try {
      const businessCurrency = ((reservation.business as any).currency || 'GBP').toUpperCase();
      const stripeInt = (reservation.business.integrations || []).find((i: any) => i.name === 'Stripe' && i.status === 'CONNECTED');
      if (stripeInt) {
        const cfg = stripeInt.config as any;
          const intent = await stripeService.createPaymentIntentWithConnect(
          Math.round(depositDiff * 100),
          businessCurrency.toLowerCase(),
          { type: 'reservation_deposit_top_up', reservation_id: reservation.id },
          cfg.accountId,
        );
        depositPaymentLink = `${env.FRONTEND_URL}/#/pay?pi=${intent.client_secret}&reservation_id=${reservation.id}&type=reservation`;
        if (twilioService.isValidPhoneNumber(reservation.guestPhone)) {
          twilioService.sendSms(
            reservation.guestPhone,
            `Hi ${reservation.guestName}, your booking has been updated to ${newGuests} guests. An additional deposit of £${depositDiff.toFixed(2)} is required. Pay here: ${depositPaymentLink}`,
          ).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[Update Reservation] Deposit top-up failed:', err);
    }
  }

  // Sync update to resOS if linked
  if (reservation.externalId) {
    const resosIntegration = reservation.business.integrations?.find(
      (i: any) => i.name === 'resOS' && i.status === 'CONNECTED',
    );
    if (resosIntegration) {
      const cfg = resosIntegration.config as any;
      if (cfg?.apiKey && cfg?.propertyId) {
        resosService.updateResOSReservation(cfg.apiKey, cfg.propertyId, reservation.externalId, {
          ...(new_date_time ? { dateTime: new Date(new_date_time).toISOString() } : {}),
          ...(new_guests ? { guests: Number(new_guests) } : {}),
        }).catch(err => console.error('[resOS] Update failed:', err));
      }
    }
  }

  const finalDate = new_date_time ? new Date(new_date_time) : reservation.dateTime;
  const finalGuests = new_guests ? Number(new_guests) : reservation.guests;
  const formattedDate = finalDate.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const ref = reservation.talkativRef || `#${reservation.id.slice(0, 8)}`;

  // SMS update confirmation (only if no deposit top-up link was already sent)
  if (reservation.guestPhone && !depositPaymentLink) {
    twilioService.sendSms(
      reservation.guestPhone,
      `Hi ${reservation.guestName}, your reservation at ${reservation.business.name} has been updated.\n\nDate: ${formattedDate}, Party: ${finalGuests} guest${finalGuests > 1 ? 's' : ''}. Ref: ${ref}.\nFull payment due at the venue.`,
    ).catch(err => console.error('[SMS] Reservation update failed:', err));
  }

  let confirmMsg = `Reservation ${ref} updated! New date: ${formattedDate}, party of ${finalGuests}.`;
  if (depositDiff > 0 && depositPaymentLink) {
    confirmMsg += ` An additional deposit of £${depositDiff.toFixed(2)} is required. A payment link has been sent to the guest.`;
  } else if (depositDiff > 0) {
    confirmMsg += ` Note: the deposit increased by £${depositDiff.toFixed(2)} but no payment integration is connected to collect it.`;
  }

  res.json({
    success: true,
    reservation_id: reservation.id,
    talkativ_ref: ref,
    confirmation: confirmMsg,
    new_date_time: finalDate.toISOString(),
    new_guests: finalGuests,
    deposit_difference: depositDiff > 0 ? depositDiff : undefined,
    deposit_payment_link: depositPaymentLink || undefined,
  });
});

// ─── Confirm Payment (agent tool) ─────────────────────────────────────────────
// Called by the agent after the customer says "I've paid". Polls the payment
// provider to verify, then marks the order confirmed + notifies the business.
export const confirmPayment = asyncHandler(async (req: Request, res: Response) => {
  const { business_id, order_id } = req.body;

  if (!business_id || !order_id) {
    res.json({ confirmed: false, message: 'Missing business_id or order_id.' });
    return;
  }

  const order = await prisma.order.findFirst({
    where: { id: order_id, businessId: business_id },
    include: { business: { include: { integrations: true, notifSettings: true, user: true } } },
  });

  if (!order) {
    res.json({ confirmed: false, message: "I couldn't find that order. Please check the order reference." });
    return;
  }

  if (order.paymentStatus === 'paid') {
    res.json({ confirmed: true, message: 'Payment was already confirmed.' });
    return;
  }

  const business = order.business as any;
  const currency = business.currency || 'GBP';
  const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
  const provider = order.paymentProvider;
  const integration = business.integrations?.find((i: any) => i.name === provider && i.status === 'CONNECTED');
  const cfg = integration?.config as any;

  let paid = false;

  if (provider === 'Square' && cfg) {
    paid = await paymentProviders.verifySquarePayment(cfg, order.id);
  } else if (provider === 'SumUp' && cfg) {
    paid = await paymentProviders.verifySumUpPayment(cfg, order.id);
  } else if ((provider === 'Stripe' || provider === 'Clover') && order.paymentIntentId) {
    // Check Stripe payment intent status
    try {
      const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId);
      paid = pi.status === 'succeeded';
    } catch { paid = false; }
  }

  if (!paid) {
    res.json({ confirmed: false, message: "I can't see a completed payment yet. Please check the link and try again, then let me know once you're done." });
    return;
  }

  // Mark order confirmed
  await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'paid', status: 'CONFIRMED' } });

  const amountPaid = Number(order.amount);

  // Customer SMS confirmation
  if (order.customerPhone && twilioService.isValidPhoneNumber(order.customerPhone)) {
    twilioService.sendSms(
      order.customerPhone,
      `Hi ${order.customerName}, your payment of ${symbol}${amountPaid.toFixed(2)} to ${business.name} is confirmed! Order #${order.id.slice(0, 8)} is being prepared.`,
    ).catch(() => {});
  }

  // Push to KDS if Square/Clover is connected
  const kdsIntegration = business.integrations?.find(
    (i: any) => ['Square', 'Clover'].includes(i.name) && i.status === 'CONNECTED',
  );
  if (kdsIntegration && !order.posOrderId) {
    try {
      const parsedItems = posService.parseItemString(order.items);
      const lineItems: posService.PosLineItem[] = parsedItems.map((p: any) => ({
        name: p.name, quantity: p.quantity, unitPriceMinor: 0,
      }));
      const posResult = await posService.pushOrderToPOS(kdsIntegration, {
        ourOrderId: order.id, customerName: order.customerName,
        customerPhone: order.customerPhone, orderType: order.type,
        deliveryAddress: order.deliveryAddress, notes: order.notes,
        allergies: order.allergies, lineItems, currency,
      });
      if (posResult) await prisma.order.update({ where: { id: order.id }, data: { posOrderId: posResult.posOrderId } });
    } catch (err) { console.error('[KDS] Post-confirm push failed:', err); }
  }

  // Owner email notification
  const ownerEmail = business.email || business.user?.email;
  if (ownerEmail && business.notifSettings?.emailNewOrder !== false) {
    emailService.sendBusinessOrderPaymentReceived(
      ownerEmail, business.name, order.id, order.customerName, order.customerPhone, order.items, amountPaid,
    ).catch(() => {});
  }

  // Owner SMS (only if no KDS)
  if (!kdsIntegration && business.phone && twilioService.isValidPhoneNumber(business.phone)) {
    twilioService.sendSms(
      business.phone,
      `[Talkativ] New order paid — ${order.customerName}, ${symbol}${amountPaid.toFixed(2)}, Order #${order.id.slice(0, 8)}: ${order.items}`,
    ).catch(() => {});
  }

  res.json({ confirmed: true, message: `Payment confirmed! Your order is all set. A confirmation message has been sent to your phone.` });
});
