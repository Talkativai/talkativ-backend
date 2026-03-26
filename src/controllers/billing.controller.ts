import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as stripeService from '../services/stripe.service.js';
import { env } from '../config/env.js';

const getBusinessId = async (userId: string) => {
  const biz = await prisma.business.findUnique({ where: { userId } });
  if (!biz) throw ApiError.notFound('Business not found');
  return biz.id;
};

export const getBilling = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const subscription = await prisma.subscription.findUnique({ where: { businessId } });
  res.json(subscription || { plan: 'NONE', status: 'NO_SUBSCRIPTION' });
});

export const getInvoices = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const subscription = await prisma.subscription.findUnique({ where: { businessId } });
  if (!subscription) return res.json([]);

  const invoices = await prisma.invoice.findMany({
    where: { subscriptionId: subscription.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(invoices);
});

export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) throw ApiError.notFound('User not found');

  const { plan, priceId } = req.body;

  // Create Stripe customer
  const customer = await stripeService.createCustomer(user.email, `${user.firstName} ${user.lastName}`);

  // Create subscription
  const stripeSub = await stripeService.createSubscription({
    customerId: customer.id,
    priceId,
    trialDays: 14,
  });

  // Save to DB
  const subscription = await prisma.subscription.create({
    data: {
      businessId,
      stripeCustomerId: customer.id,
      stripeSubscriptionId: stripeSub.id,
      plan,
      status: 'TRIALING',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  res.status(201).json(subscription);
});

export const changePlan = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
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
  const businessId = await getBusinessId(req.user!.userId);
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
  const businessId = await getBusinessId(req.user!.userId);
  const subscription = await prisma.subscription.findUnique({ where: { businessId } });
  if (!subscription?.stripeCustomerId) throw ApiError.badRequest('No Stripe customer');

  const session = await stripeService.createPortalSession(subscription.stripeCustomerId, `${env.FRONTEND_URL}/billing`);
  res.json({ url: session.url });
});
