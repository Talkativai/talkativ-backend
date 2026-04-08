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
  res.json(subscription || { plan: 'NONE', status: 'NO_SUBSCRIPTION' });
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
  if (paymentMethodId) {
    await stripeService.attachPaymentMethod(paymentMethodId, customerId);
  }

  // Create subscription with 14-day trial
  const stripeSub = await stripeService.createSubscription({
    customerId,
    priceId,
    trialDays: 14,
    defaultPaymentMethod: paymentMethodId,
  });

  // Save to DB
  const subscription = await prisma.subscription.upsert({
    where: { businessId },
    update: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: stripeSub.id,
      plan,
      status: 'TRIALING',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    create: {
      businessId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: stripeSub.id,
      plan,
      status: 'TRIALING',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
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

  const session = await stripeService.createPortalSession(subscription.stripeCustomerId, `${env.FRONTEND_URL}/billing`);
  res.json({ url: session.url });
});
