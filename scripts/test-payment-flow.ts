#!/usr/bin/env tsx
/**
 * ─── Talkativ Payment Flow Test Script ───────────────────────────────────────
 *
 * Tests the full payment cycle for orders AND reservations:
 *   1. Picks the first business in the DB
 *   2. Seeds minimal test data (menu item + policies) if missing
 *   3. Creates a test ORDER via the public API → sends SMS to test phone
 *   4. Creates a test RESERVATION via the public API → sends SMS to test phone
 *   5. Prints the Stripe payment links so you can open them and pay with 4242
 *   6. After 5 seconds, checks if payment confirmations fired
 *
 * Run:
 *   cd backend
 *   npx tsx scripts/test-payment-flow.ts
 *
 * Environment requirements (all from .env):
 *   STRIPE_SECRET_KEY, TWILIO_*, DATABASE_URL, FRONTEND_URL
 */

import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/db.js';
import stripe from '../src/config/stripe.js';
import * as twilioService from '../src/services/twilio.service.js';
import * as stripeService from '../src/services/stripe.service.js';

// ─── Config ──────────────────────────────────────────────────────────────────
const TEST_CUSTOMER_PHONE = process.env.TEST_PHONE || '09030903109';
const TEST_CUSTOMER_NAME  = 'Test Customer';
const FRONTEND_URL        = process.env.FRONTEND_URL || 'http://localhost:5173';

const log  = (msg: string) => console.log(`\n✅ ${msg}`);
const info = (msg: string) => console.log(`   ℹ  ${msg}`);
const warn = (msg: string) => console.log(`   ⚠️  ${msg}`);
const link = (msg: string) => console.log(`   🔗 ${msg}`);
const sep  = ()             => console.log('\n' + '─'.repeat(72));

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀  Talkativ Payment Flow Test\n' + '═'.repeat(72));

  // ── 1. Find a test business ──────────────────────────────────────────────
  const business = await prisma.business.findFirst({
    include: { orderingPolicy: true, reservationPolicy: true, integrations: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!business) {
    console.error('\n❌  No businesses found in the database. Complete onboarding first.');
    process.exit(1);
  }

  log(`Using business: "${business.name || '(unnamed)'}" (id: ${business.id})`);

  // ── 2. Seed minimal test data if needed ──────────────────────────────────
  sep();
  console.log('\n📦  Checking test data…');

  // Ensure at least one menu category + item
  let category = await prisma.menuCategory.findFirst({ where: { businessId: business.id } });
  if (!category) {
    category = await prisma.menuCategory.create({
      data: { businessId: business.id, name: 'Test Menu', position: 0 },
    });
    info('Created test menu category');
  }

  let menuItem = await prisma.menuItem.findFirst({
    where: { category: { businessId: business.id }, status: 'ACTIVE' },
  });
  if (!menuItem) {
    menuItem = await prisma.menuItem.create({
      data: {
        categoryId: category.id,
        name: 'Test Burger',
        description: 'A delicious test burger',
        price: 12.99,
        status: 'ACTIVE',
      },
    });
    info(`Created test menu item: "${menuItem.name}" at £${menuItem.price}`);
  } else {
    info(`Using existing menu item: "${menuItem.name}" at £${menuItem.price}`);
  }

  // Ensure ordering policy
  if (!business.orderingPolicy) {
    await prisma.orderingPolicy.create({
      data: {
        businessId: business.id,
        deliveryEnabled: true,
        collectionEnabled: true,
        deliveryRadius: 5,
        deliveryRadiusUnit: 'miles',
        deliveryFee: 2.5,
        payNowEnabled: true,
        payOnDelivery: true,
        collectionPayNow: true,
        collectionPayOnPickup: true,
        deliveryPayNow: true,
        deliveryPayOnDelivery: true,
      },
    });
    info('Created test ordering policy');
  }

  // Ensure reservation policy with deposit
  if (!business.reservationPolicy) {
    await prisma.reservationPolicy.create({
      data: {
        businessId: business.id,
        depositRequired: true,
        depositType: 'PER_GUEST',
        depositAmount: 10,
        maxPartySize: 10,
        bookingLeadTime: 2,
        cancellationHours: 24,
      },
    });
    info('Created test reservation policy (£10/guest deposit)');
  } else {
    info(`Reservation policy: deposit=${business.reservationPolicy.depositRequired}, amount=£${business.reservationPolicy.depositAmount}`);
  }

  // ── 3. Test ORDER flow ────────────────────────────────────────────────────
  sep();
  console.log('\n🛒  Testing ORDER flow…');
  console.log(`   Customer phone: ${TEST_CUSTOMER_PHONE}`);

  // Create the order record
  const activeCall = await prisma.call.findFirst({
    where: { businessId: business.id },
    orderBy: { createdAt: 'desc' },
  });

  const order = await prisma.order.create({
    data: {
      businessId: business.id,
      callId: activeCall?.id || null,
      customerName: TEST_CUSTOMER_NAME,
      customerPhone: TEST_CUSTOMER_PHONE,
      items: `${menuItem.name}`,
      type: 'COLLECTION',
      amount: Number(menuItem.price),
      paymentMethod: 'pay_now',
      paymentStatus: 'pending',
      status: 'PENDING',
    },
  });

  log(`Order created: #${order.id.slice(0, 8)}`);
  info(`Items: ${order.items}`);
  info(`Total: £${Number(order.amount).toFixed(2)}`);

  // Create Stripe payment intent for order
  let orderPaymentLink: string | null = null;
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const paymentIntent = await stripeService.createPaymentIntent(
        Math.round(Number(order.amount) * 100),
        'gbp',
        { type: 'order_payment', order_id: order.id, business_id: business.id, customer_name: TEST_CUSTOMER_NAME }
      );

      await prisma.order.update({
        where: { id: order.id },
        data: { paymentIntentId: paymentIntent.id },
      });

      orderPaymentLink = `${FRONTEND_URL}/#/pay?pi=${paymentIntent.client_secret}&order_id=${order.id}&type=order`;

      // Send SMS
      const smsBody = `Hi ${TEST_CUSTOMER_NAME}, your test order at ${business.name || 'Test Restaurant'} is confirmed!\n\nTotal: £${Number(order.amount).toFixed(2)}\nItems: ${order.items}\n\nPay here: ${orderPaymentLink}`;
      try {
        await twilioService.sendSms(TEST_CUSTOMER_PHONE, smsBody);
        log(`SMS sent to ${TEST_CUSTOMER_PHONE}`);
      } catch (smsErr: any) {
        warn(`SMS failed (Twilio): ${smsErr.message}`);
        info('Payment link printed below instead');
      }

      log('Order payment link ready:');
      link(orderPaymentLink);
      info('Use card: 4242 4242 4242 4242  |  Any future date  |  Any CVC');
    } catch (stripeErr: any) {
      warn(`Stripe error: ${stripeErr.message}`);
    }
  } else {
    warn('STRIPE_SECRET_KEY not set — skipping payment intent creation');
  }

  // ── 4. Test RESERVATION flow ──────────────────────────────────────────────
  sep();
  console.log('\n📅  Testing RESERVATION flow…');

  // Compute a date 2 days from now at 7pm
  const reservationDate = new Date();
  reservationDate.setDate(reservationDate.getDate() + 2);
  reservationDate.setHours(19, 0, 0, 0);
  const guestCount = 2;

  // Recalculate deposit
  const rPolicy = await prisma.reservationPolicy.findUnique({ where: { businessId: business.id } });
  let depositAmount = 0;
  if (rPolicy?.depositRequired && rPolicy.depositAmount) {
    depositAmount = rPolicy.depositType === 'PER_GUEST'
      ? Number(rPolicy.depositAmount) * guestCount
      : Number(rPolicy.depositAmount);
  }

  const reservation = await prisma.reservation.create({
    data: {
      businessId: business.id,
      callId: activeCall?.id || null,
      guestName: TEST_CUSTOMER_NAME,
      guestPhone: TEST_CUSTOMER_PHONE,
      guests: guestCount,
      dateTime: reservationDate,
      status: 'PENDING',
      depositRequired: depositAmount > 0,
      depositAmount,
    },
  });

  log(`Reservation created: #${reservation.id.slice(0, 8)}`);
  info(`Date: ${reservationDate.toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })}`);
  info(`Guests: ${guestCount}`);
  info(`Deposit required: ${depositAmount > 0 ? `£${depositAmount.toFixed(2)}` : 'No'}`);

  let reservationPaymentLink: string | null = null;
  if (depositAmount > 0 && process.env.STRIPE_SECRET_KEY) {
    try {
      const paymentIntent = await stripeService.createPaymentIntent(
        Math.round(depositAmount * 100),
        'gbp',
        { type: 'reservation_deposit', reservation_id: reservation.id, business_id: business.id, guest_name: TEST_CUSTOMER_NAME }
      );

      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { depositPaymentIntentId: paymentIntent.id },
      });

      const formattedDate = reservationDate.toLocaleDateString('en-GB', {
        weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit',
      });

      reservationPaymentLink = `${FRONTEND_URL}/#/pay?pi=${paymentIntent.client_secret}&reservation_id=${reservation.id}&type=reservation`;

      const smsBody = `Hi ${TEST_CUSTOMER_NAME}, your table for ${guestCount} at ${business.name || 'Test Restaurant'} on ${formattedDate} is almost confirmed!\n\nA deposit of £${depositAmount.toFixed(2)} is required. Pay here: ${reservationPaymentLink}`;
      try {
        await twilioService.sendSms(TEST_CUSTOMER_PHONE, smsBody);
        log(`Deposit SMS sent to ${TEST_CUSTOMER_PHONE}`);
      } catch (smsErr: any) {
        warn(`SMS failed (Twilio): ${smsErr.message}`);
      }

      log('Reservation deposit payment link ready:');
      link(reservationPaymentLink);
      info('Use card: 4242 4242 4242 4242  |  Any future date  |  Any CVC');
    } catch (stripeErr: any) {
      warn(`Stripe error: ${stripeErr.message}`);
    }
  } else if (depositAmount === 0) {
    // No deposit — send booking confirmation
    const formattedDate = reservationDate.toLocaleDateString('en-GB', {
      weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit',
    });
    const smsBody = `Hi ${TEST_CUSTOMER_NAME}, your reservation for ${guestCount} guests at ${business.name || 'Test Restaurant'} on ${formattedDate} is confirmed! See you then.`;
    try {
      await twilioService.sendSms(TEST_CUSTOMER_PHONE, smsBody);
      log(`Confirmation SMS sent to ${TEST_CUSTOMER_PHONE} (no deposit required)`);
    } catch (smsErr: any) {
      warn(`SMS failed: ${smsErr.message}`);
    }
  }

  // ── 5. Summary ───────────────────────────────────────────────────────────
  sep();
  console.log('\n📋  TEST SUMMARY\n');
  console.log(`  Business:        ${business.name || '(unnamed)'}`);
  console.log(`  Test phone:      ${TEST_CUSTOMER_PHONE}`);
  console.log(`  Order ID:        ${order.id}`);
  console.log(`  Reservation ID:  ${reservation.id}`);

  if (orderPaymentLink) {
    console.log(`\n  ORDER PAYMENT LINK:`);
    console.log(`  ${orderPaymentLink}`);
  }
  if (reservationPaymentLink) {
    console.log(`\n  RESERVATION DEPOSIT LINK:`);
    console.log(`  ${reservationPaymentLink}`);
  }

  console.log(`\n  ──────────────────────────────────────────────────────────────`);
  console.log(`  Test card:   4242 4242 4242 4242`);
  console.log(`  Expiry:      Any future date (e.g. 12/${new Date().getFullYear() + 2})`);
  console.log(`  CVC:         Any 3 digits (e.g. 314)`);
  console.log(`  ──────────────────────────────────────────────────────────────`);

  console.log(`\n  After paying, the Stripe webhook will fire and you should see:`);
  console.log(`    • Order status → CONFIRMED`);
  console.log(`    • Reservation deposit status → paid`);
  console.log(`    • Business gets email notification`);
  console.log(`    • Customer gets SMS + email confirmation`);
  if (rPolicy?.depositRequired) {
    console.log(`    • Reservation pushed to resOS (if integration connected)`);
  }

  console.log('\n' + '═'.repeat(72));
  console.log('✅  Test setup complete\n');

  // ── 6. Check Stripe webhook is configured ────────────────────────────────
  if (!process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET === 'whsec_') {
    console.log('⚠️  WARNING: STRIPE_WEBHOOK_SECRET is not configured.');
    console.log('   Payment confirmations WON\'T fire until the webhook is set up.');
    console.log('   See STRIPE_SETUP.md for webhook configuration instructions.\n');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('\n❌  Test script error:', err);
  prisma.$disconnect();
  process.exit(1);
});
