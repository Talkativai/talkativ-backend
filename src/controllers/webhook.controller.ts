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

// ─── ElevenLabs Webhook ──────────────────────────────────────────────────────
export const elevenlabsWebhook = asyncHandler(async (req: Request, res: Response) => {
  // Verify webhook secret
  const secret = req.headers['x-webhook-secret'] || req.headers['authorization'];
  if (secret !== env.AGENT_WEBHOOK_SECRET) {
    throw ApiError.unauthorized('Invalid webhook secret');
  }

  const { event, data } = req.body;

  if (event === 'conversation_initiation_metadata') {
    // Create a new call record
    const businessId = data.business_id;
    if (businessId) {
      await prisma.call.create({
        data: {
          businessId,
          callerPhone: data.caller_phone || null,
          status: 'LIVE',
          elevenlabsConvId: data.conversation_id || null,
          startedAt: new Date(),
        },
      });
    }
  } else if (event === 'conversation_ended') {
    const convId = data.conversation_id;
    if (convId) {
      const call = await prisma.call.findFirst({ where: { elevenlabsConvId: convId } });
      if (call) {
        await prisma.call.update({
          where: { id: call.id },
          data: {
            status: data.status === 'missed' ? 'MISSED' : 'COMPLETED',
            duration: data.duration || null,
            transcript: data.transcript || null,
            outcome: data.outcome || null,
            outcomeType: data.outcome_type || null,
            endedAt: new Date(),
          },
        });
      }
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
        if (order.customerPhone) {
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

        // ── Push to resOS now that deposit is confirmed ───────────────────────
        const resosIntegration = reservation.business.integrations?.find(
          (i: any) => i.name === 'resOS' && i.status === 'CONNECTED',
        );
        if (resosIntegration) {
          const cfg = resosIntegration.config as any;
          if (cfg?.apiKey && cfg?.propertyId) {
            resosService.createResOSReservation(cfg.apiKey, cfg.propertyId, {
              guestName: reservation.guestName,
              guestPhone: reservation.guestPhone,
              guests: reservation.guests,
              dateTime: reservation.dateTime.toISOString(),
              notes: `Deposit of £${depositPaid.toFixed(2)} paid via Talkativ`,
            }).then(async (result) => {
              if (result.success && result.reservationId) {
                await prisma.reservation.update({
                  where: { id: reservation.id },
                  data: { externalId: result.reservationId },
                });
              }
            }).catch(err => console.error('[resOS] Post-deposit push failed:', err));
          }
        }

        // ── SMS confirmation to guest ─────────────────────────────────────────
        const formattedDate = reservation.dateTime.toLocaleDateString('en-GB', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        if (reservation.guestPhone) {
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

const geocodePostalCode = async (postalCode: string) => {
  try {
    const apiKey = env.GOOGLE_PLACES_API;
    if (!apiKey) {
      console.error("GOOGLE_PLACES_API key not configured");
      return null;
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(postalCode)}&key=${apiKey}`;
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
    customer_phone,
    items,
    type,
    allergies,
    payment_method, // "pay_now" or "pay_on_delivery"/"pay_on_collection"
    notes,
    delivery_address,
  } = req.body;

  // Check business hours before accepting order
  const business = await prisma.business.findUnique({
    where: { id: business_id },
    include: { orderingPolicy: true, integrations: true, notifSettings: true },
  });
  if (!business) {
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
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[now.getDay()];
    const hours = business.openingHours as Record<string, any>;
    const todayHours = hours[currentDay];

    if (todayHours && todayHours.closed) {
      const hoursStr = Object.entries(hours)
        .filter(([_, v]: [string, any]) => !v.closed)
        .map(([day, v]: [string, any]) => `${day}: ${v.open} - ${v.close}`)
        .join(', ');
      res.json({
        error: true,
        message: `Sorry, we're currently closed. Our opening hours are: ${hoursStr}. Please call back during business hours to place an order!`,
      });
      return;
    }
  }

  // Calculate amount from items (basic — in production, look up actual prices)
  let totalAmount = 0;
  if (typeof items === 'string') {
    // Try to parse from menu
    const itemNames = items.split(',').map((i: string) => i.trim());
    for (const itemName of itemNames) {
      const menuItem = await prisma.menuItem.findFirst({
        where: {
          category: { businessId: business_id },
          name: { contains: itemName, mode: 'insensitive' },
          status: 'ACTIVE',
        },
      });
      if (menuItem) totalAmount += Number(menuItem.price);
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

  let paymentLink = null;

  // If customer chooses "pay now", create a Stripe payment intent and send link via SMS
  if (payment_method === 'pay_now' && totalAmount > 0 && customer_phone) {
    try {
      const paymentIntent = await stripeService.createPaymentIntent(
        Math.round(totalAmount * 100),
        'gbp',
        { type: 'order_payment', order_id: order.id, business_id, customer_name }
      );

      await prisma.order.update({
        where: { id: order.id },
        data: { paymentIntentId: paymentIntent.id },
      });

      paymentLink = paymentIntent.client_secret;

      // Send payment link via SMS
      const link = `${env.FRONTEND_URL}/pay?pi=${paymentIntent.client_secret}&order_id=${order.id}&type=order`;
      const smsBody = `Hi ${customer_name}, your order at ${business.name} is confirmed!\n\nTotal: £${totalAmount.toFixed(2)}\nItems: ${items}\n\nPay here: ${link}`;
      twilioService.sendSms(customer_phone, smsBody).catch(err => console.error('[SMS] Failed to send payment link:', err));
    } catch (stripeErr) {
      console.error('Failed to create payment intent:', stripeErr);
    }
  } else if (customer_phone) {
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
    payment_link: paymentLink ? `${env.FRONTEND_URL}/pay?pi=${paymentLink}&order_id=${order.id}&type=order` : null,
    total: totalAmount,
  });
});

export const createReservation = asyncHandler(async (req: Request, res: Response) => {
  const {
    business_id,
    guest_name,
    guest_phone,
    guests,
    date_time,
  } = req.body;

  // Check business hours before accepting reservation
  const business = await prisma.business.findUnique({
    where: { id: business_id },
    include: { reservationPolicy: true, integrations: true, notifSettings: true },
  });
  if (!business) {
    res.json({ error: true, message: "I'm sorry, our reservation service isn't available right now. Kindly try again later." });
    return;
  }

  // Check if reservation integration (resOS) is connected
  const reservationIntegration = business.integrations?.find(
    (i: any) => i.name === 'resOS' && i.status === 'CONNECTED'
  );
  if (!reservationIntegration) {
    res.json({ error: true, message: "I'm sorry, our reservation service isn't currently connected. Kindly try again later or contact us directly to book a table." });
    return;
  }

  if (business.openingHours) {
    const reservationDate = new Date(date_time);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const reservationDay = dayNames[reservationDate.getDay()];
    const hours = business.openingHours as Record<string, any>;
    const dayHours = hours[reservationDay];

    if (dayHours && dayHours.closed) {
      const hoursStr = Object.entries(hours)
        .filter(([_, v]: [string, any]) => !v.closed)
        .map(([day, v]: [string, any]) => `${day}: ${v.open} - ${v.close}`)
        .join(', ');
      res.json({
        error: true,
        message: `Sorry, we're closed on ${reservationDay}. Our opening hours are: ${hoursStr}. Would you like to book for a different day?`,
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

  // If deposit is required, create payment intent and send link via SMS
  if (depositRequired && actualDeposit > 0 && guest_phone) {
    try {
      const paymentIntent = await stripeService.createPaymentIntent(
        Math.round(actualDeposit * 100),
        'gbp',
        { type: 'reservation_deposit', reservation_id: reservation.id, business_id, guest_name }
      );

      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { depositPaymentIntentId: paymentIntent.id },
      });

      paymentLink = paymentIntent.client_secret;

      // Send deposit payment link via SMS
      const link = `${env.FRONTEND_URL}/pay?pi=${paymentIntent.client_secret}&reservation_id=${reservation.id}&type=reservation`;
      const smsBody = `Hi ${guest_name}, your table for ${guests} at ${business.name} on ${formattedDate} is almost confirmed!\n\nA deposit of £${actualDeposit.toFixed(2)} is required. Pay here: ${link}`;
      twilioService.sendSms(guest_phone, smsBody).catch(err => console.error('[SMS] Failed to send deposit link:', err));
    } catch (stripeErr) {
      console.error('Failed to create deposit payment intent:', stripeErr);
    }
  } else if (guest_phone) {
    // No deposit — send booking confirmation SMS
    const smsBody = `Hi ${guest_name}, your reservation for ${guests} guest${guests > 1 ? 's' : ''} at ${business.name} on ${formattedDate} is confirmed! See you then.`;
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

  // ── Push to resOS if connected ────────────────────────────────────────────
  // Only push immediately if no deposit is required.
  // When deposit IS required, the push happens in the Stripe webhook AFTER payment.
  if (reservationIntegration && !(depositRequired && actualDeposit > 0)) {
    const config = reservationIntegration.config as any;
    if (config?.apiKey && config?.propertyId) {
      const resosResult = await resosService.createResOSReservation(
        config.apiKey,
        config.propertyId,
        {
          guestName: guest_name,
          guestPhone: guest_phone || null,
          guests,
          dateTime: date_time,
          notes: depositMessage || null,
        }
      );

      if (resosResult.success && resosResult.reservationId) {
        await prisma.reservation.update({
          where: { id: reservation.id },
          data: { externalId: resosResult.reservationId },
        });
        console.log(`[resOS] Reservation pushed — resOS ID: ${resosResult.reservationId}`);
      } else {
        console.error('[resOS] Push failed but reservation saved locally:', resosResult.message);
      }
    }
  } else if (depositRequired && actualDeposit > 0) {
    console.log(`[resOS] Deposit required — deferring resOS push until deposit is paid.`);
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
    confirmation: `Reservation created successfully!${depositMessage}`,
    deposit_required: depositRequired,
    deposit_amount: actualDeposit,
    payment_link: paymentLink ? `${env.FRONTEND_URL}/pay?pi=${paymentLink}&reservation_id=${reservation.id}&type=reservation` : null,
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
export const cancelReservation = asyncHandler(async (req: Request, res: Response) => {
  const { reservation_id, business_id, guest_phone } = req.body;

  if (!reservation_id && !guest_phone) {
    res.json({ error: true, message: 'Please provide the booking reference or the phone number used when booking.' });
    return;
  }

  // Look up reservation by ID or phone, scoped to this business
  const reservation = await prisma.reservation.findFirst({
    where: {
      businessId: business_id,
      status: { not: 'CANCELLED' },
      ...(reservation_id ? { id: reservation_id } : {}),
      ...(guest_phone && !reservation_id ? { guestPhone: guest_phone } : {}),
    },
    include: {
      business: { include: { integrations: true, notifSettings: true } },
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

  // SMS to guest
  if (reservation.guestPhone) {
    twilioService.sendSms(
      reservation.guestPhone,
      `Hi ${reservation.guestName}, your reservation at ${reservation.business.name} on ${formattedDate} has been cancelled. Booking ref: #${reservation.id.slice(0, 8)}.`,
    ).catch(err => console.error('[SMS] Cancellation confirm failed:', err));
  }

  // Email alerts
  if (reservation.guestEmail) {
    emailService.sendReservationCancellationToGuest(
      reservation.guestEmail,
      reservation.guestName,
      reservation.business.name,
      reservation.dateTime,
      reservation.id,
    ).catch(() => {});
  }

  if (reservation.business.email && reservation.business.notifSettings?.emailNewReservation !== false) {
    emailService.sendBusinessReservationCancelled(
      reservation.business.email,
      reservation.business.name,
      reservation.id,
      reservation.guestName,
      reservation.guestPhone,
      reservation.dateTime,
    ).catch(() => {});
  }

  let depositNote = '';
  const depositAmountNum = Number(reservation.depositAmount ?? 0);
  if (reservation.depositPaid && depositAmountNum > 0) {
    depositNote = ` As a deposit of £${depositAmountNum.toFixed(2)} was paid, please contact ${reservation.business.name} directly to discuss any refund.`;
  }

  res.json({
    success: true,
    reservation_id: reservation.id,
    confirmation: `Reservation for ${reservation.guestName} on ${formattedDate} has been cancelled.${depositNote}`,
  });
});

// ─── Update Reservation (agent tool) ──────────────────────────────────────────
// Called by ElevenLabs agent when a caller wants to change date/time or party size.
export const updateReservation = asyncHandler(async (req: Request, res: Response) => {
  const { reservation_id, business_id, guest_phone, new_date_time, new_guests } = req.body;

  if (!reservation_id && !guest_phone) {
    res.json({ error: true, message: 'Please provide the booking reference or the phone number used when booking.' });
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
      ...(reservation_id ? { id: reservation_id } : {}),
      ...(guest_phone && !reservation_id ? { guestPhone: guest_phone } : {}),
    },
    include: {
      business: { include: { integrations: true, notifSettings: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!reservation) {
    res.json({ error: true, message: "I couldn't find an active reservation with those details. Please double-check the booking reference or phone number." });
    return;
  }

  // Validate new date if business hours exist
  if (new_date_time && reservation.business.openingHours) {
    const newDate = new Date(new_date_time);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[newDate.getDay()];
    const hours = reservation.business.openingHours as Record<string, any>;
    if (hours[dayName]?.closed) {
      res.json({ error: true, message: `Sorry, we're closed on ${dayName}. Please choose a different day.` });
      return;
    }
  }

  const updatedData: any = {};
  if (new_date_time) updatedData.dateTime = new Date(new_date_time);
  if (new_guests) updatedData.guests = Number(new_guests);

  await prisma.reservation.update({ where: { id: reservation.id }, data: updatedData });

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

  // SMS update confirmation
  if (reservation.guestPhone) {
    twilioService.sendSms(
      reservation.guestPhone,
      `Hi ${reservation.guestName}, your reservation at ${reservation.business.name} has been updated.\n\nNew details — Date: ${formattedDate}, Party size: ${finalGuests} guest${finalGuests > 1 ? 's' : ''}. Booking ref: #${reservation.id.slice(0, 8)}.`,
    ).catch(err => console.error('[SMS] Reservation update failed:', err));
  }

  res.json({
    success: true,
    reservation_id: reservation.id,
    confirmation: `Reservation updated! New date: ${formattedDate}, party of ${finalGuests}. A confirmation SMS has been sent to the guest.`,
    new_date_time: finalDate.toISOString(),
    new_guests: finalGuests,
  });
});
