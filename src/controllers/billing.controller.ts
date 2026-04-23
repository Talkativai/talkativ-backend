import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as stripeService from '../services/stripe.service.js';
import { env } from '../config/env.js';

export const getBilling = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const subscription = await prisma.subscription.findUnique({ where: { businessId } });
  if (!subscription) return res.json({ plan: 'NONE', status: 'NO_SUBSCRIPTION' });

  // If we have a Stripe customer but no cached card details, try to fetch from Stripe
  if (subscription.stripeCustomerId && !subscription.cardLast4 && env.STRIPE_SECRET_KEY) {
    try {
      const paymentMethods = await stripeService.getDefaultPaymentMethod(subscription.stripeCustomerId);
      if (paymentMethods) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { cardBrand: paymentMethods.brand, cardLast4: paymentMethods.last4 },
        });
        return res.json({ ...subscription, cardBrand: paymentMethods.brand, cardLast4: paymentMethods.last4 });
      }
    } catch {}
  }

  res.json(subscription);
});

export const getInvoices = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const subscription = await prisma.subscription.findUnique({ where: { businessId } });
  if (!subscription) return res.json([]);

  const invoices = await prisma.invoice.findMany({
    where: { subscriptionId: subscription.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(invoices);
});

// ─── Create SetupIntent (collect card for trial) ─────────────────────────────
export const createSetupIntent = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');

  // Dev bypass — no Stripe key configured, skip card collection entirely
  if (!env.STRIPE_SECRET_KEY) {
    return res.json({ clientSecret: null, devMode: true });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) throw ApiError.notFound('User not found');

  // Check if we already have a Stripe customer
  let subscription = await prisma.subscription.findUnique({ where: { businessId } });
  let customerId = subscription?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripeService.createCustomer(user.email, `${user.firstName} ${user.lastName}`);
    customerId = customer.id;

    // Save the customer ID early (subscription record created without stripe sub yet)
    if (subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { stripeCustomerId: customerId },
      });
    }
  }

  const setupIntent = await stripeService.createSetupIntent(customerId);

  res.json({
    clientSecret: setupIntent.client_secret,
    customerId,
  });
});

// ─── Subscribe (after card is collected via SetupIntent) ─────────────────────
export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');

  const { plan } = req.body;

  // Dev bypass — no Stripe key, just create a trial subscription record locally
  if (!env.STRIPE_SECRET_KEY) {
    const subscription = await prisma.subscription.upsert({
      where: { businessId },
      update: { plan, status: 'TRIALING', trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
      create: { businessId, plan, status: 'TRIALING', trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
    });
    return res.status(201).json(subscription);
  }

  const { priceId, paymentMethodId } = req.body;

  // If no priceId, or it's a product ID (prod_) instead of a price ID (price_), skip Stripe
  if (!priceId || !priceId.startsWith('price_')) {
    const subscription = await prisma.subscription.upsert({
      where: { businessId },
      update: { plan, status: 'TRIALING', trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
      create: { businessId, plan, status: 'TRIALING', trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
    });
    return res.status(201).json(subscription);
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) throw ApiError.notFound('User not found');

  // Get or create Stripe customer
  let existingSub = await prisma.subscription.findUnique({ where: { businessId } });
  let customerId = existingSub?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripeService.createCustomer(user.email, `${user.firstName} ${user.lastName}`);
    customerId = customer.id;
  }

  // Attach payment method to customer if provided
  let cardBrand: string | null = null;
  let cardLast4: string | null = null;

  if (paymentMethodId) {
    await stripeService.attachPaymentMethod(paymentMethodId, customerId);
    // Fetch card details to store for display
    try {
      const pm = await stripeService.getPaymentMethodDetails(paymentMethodId);
      cardBrand = pm?.brand ?? null;
      cardLast4 = pm?.last4 ?? null;
    } catch {}
  }

  // Create subscription with 14-day trial
  const stripeSub = await stripeService.createSubscription({
    customerId,
    priceId,
    trialDays: 14,
    defaultPaymentMethod: paymentMethodId,
  });

  // Save to DB (including card display details)
  const subscription = await prisma.subscription.upsert({
    where: { businessId },
    update: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: stripeSub.id,
      plan,
      status: 'TRIALING',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      ...(cardBrand && { cardBrand }),
      ...(cardLast4 && { cardLast4 }),
    },
    create: {
      businessId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: stripeSub.id,
      plan,
      status: 'TRIALING',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      cardBrand,
      cardLast4,
    },
  });

  res.status(201).json(subscription);
});

export const changePlan = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const subscription = await prisma.subscription.findUnique({ where: { businessId } });
  if (!subscription?.stripeSubscriptionId) throw ApiError.badRequest('No active subscription');

  await stripeService.changePlan(subscription.stripeSubscriptionId, req.body.priceId);

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: { plan: req.body.plan },
  });
  res.json(updated);
});

export const cancelSubscription = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const subscription = await prisma.subscription.findUnique({ where: { businessId } });
  if (!subscription?.stripeSubscriptionId) throw ApiError.badRequest('No active subscription');

  await stripeService.cancelSubscription(subscription.stripeSubscriptionId);

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: { cancelAtPeriodEnd: true },
  });
  res.json(updated);
});

export const getPortal = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const subscription = await prisma.subscription.findUnique({ where: { businessId } });
  if (!subscription?.stripeCustomerId) throw ApiError.badRequest('No Stripe customer');

  const session = await stripeService.createPortalSession(subscription.stripeCustomerId, `${env.FRONTEND_URL}/#/dashboard/billing`);
  res.json({ url: session.url });
});

// ─── Attach test card (test-mode only) ───────────────────────────────────────
// Creates a Stripe test PaymentMethod (Visa 4242) and attaches it to the customer,
// then creates the trial subscription without requiring a real card form.
export const attachTestCard = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');

  // Only available in Stripe test mode
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    throw ApiError.badRequest('Test card attachment is only available in test mode');
  }

  const { plan } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) throw ApiError.notFound('User not found');

  // Get or create Stripe customer
  let existingSub = await prisma.subscription.findUnique({ where: { businessId } });
  let customerId = existingSub?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripeService.createCustomer(user.email, `${user.firstName} ${user.lastName}`);
    customerId = customer.id;
  }

  // Create a test PaymentMethod using Stripe's tok_visa test token
  const testPaymentMethod = await stripeService.createTestPaymentMethod(customerId);
  const cardBrand = testPaymentMethod.brand;
  const cardLast4 = testPaymentMethod.last4;

  // Build subscription — if no valid priceId configured, just create a local trial record
  const priceId = req.body.priceId;
  let stripeSubId: string | null = null;

  if (priceId && priceId.startsWith('price_')) {
    const stripeSub = await stripeService.createSubscription({
      customerId,
      priceId,
      trialDays: 14,
      defaultPaymentMethod: testPaymentMethod.paymentMethodId,
    });
    stripeSubId = stripeSub.id;
  }

  const subscription = await prisma.subscription.upsert({
    where: { businessId },
    update: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: stripeSubId,
      plan: (plan || 'GROWTH').toUpperCase() as any,
      status: 'TRIALING',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      cardBrand,
      cardLast4,
    },
    create: {
      businessId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: stripeSubId,
      plan: (plan || 'GROWTH').toUpperCase() as any,
      status: 'TRIALING',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      cardBrand,
      cardLast4,
    },
  });

  res.status(201).json({
    ...subscription,
    testMode: true,
    message: `Test card (${cardBrand?.toUpperCase()} •••• ${cardLast4}) attached successfully`,
  });
});
