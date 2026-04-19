import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import { Prisma } from '@prisma/client';
import stripe from '../config/stripe.js';
import { env } from '../config/env.js';
import crypto from 'crypto';

// ─── Credential verification helpers ─────────────────────────────────────────

async function verifySquareCredentials(accessToken: string): Promise<void> {
  const squareBase = env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
  const res = await fetch(`${squareBase}/v2/locations`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Square-Version': '2024-01-18' },
  });
  if (res.status === 401) throw ApiError.badRequest('Square access token is invalid. Check your credentials and try again.');
  if (!res.ok) throw ApiError.badRequest(`Square returned an unexpected error (${res.status}). Please try again.`);
}

async function verifyCloverCredentials(accessToken: string, merchantId: string): Promise<void> {
  const cloverBase = env.CLOVER_ENVIRONMENT === 'production'
    ? 'https://api.clover.com'
    : 'https://apisandbox.dev.clover.com';
  const res = await fetch(`${cloverBase}/v3/merchants/${merchantId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) throw ApiError.badRequest('Clover access token is invalid. Check your credentials and try again.');
  if (res.status === 404) throw ApiError.badRequest('Clover merchant ID not found. Check your merchant ID and try again.');
  if (!res.ok) throw ApiError.badRequest(`Clover returned an unexpected error (${res.status}). Please try again.`);
}

async function verifyResOsCredentials(apiKey: string, restaurantId: string): Promise<void> {
  const res = await fetch(`https://api.resos.com/api/v1/reservations`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'X-Restaurant-ID': restaurantId },
  });
  if (res.status === 401) throw ApiError.badRequest('resOS API key is invalid. Check your credentials and try again.');
  if (!res.ok) throw ApiError.badRequest(`resOS returned an unexpected error (${res.status}). Please try again.`);
}

async function verifySumUpCredentials(apiKey: string, merchantCode: string): Promise<void> {
  const res = await fetch('https://api.sumup.com/v0.1/me', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 401) throw ApiError.badRequest('SumUp API key is invalid. Check your credentials and try again.');
  if (!res.ok) throw ApiError.badRequest(`SumUp returned an unexpected error (${res.status}). Please try again.`);
  const data = await res.json() as any;
  if (data.merchant_profile?.merchant_code && data.merchant_profile.merchant_code !== merchantCode) {
    throw ApiError.badRequest('SumUp merchant code does not match this API key. Please check your merchant code.');
  }
}

async function verifyZettleCredentials(apiKey: string): Promise<void> {
  const res = await fetch('https://oauth.zettle.com/users/me', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 401) throw ApiError.badRequest('Zettle API key is invalid. Check your credentials and try again.');
  if (!res.ok) throw ApiError.badRequest(`Zettle returned an unexpected error (${res.status}). Please try again.`);
}

async function verifyOpenTableCredentials(apiKey: string, restaurantId: string): Promise<void> {
  // OpenTable's Connect API requires partner approval — we validate the format only
  if (!apiKey || apiKey.length < 8) throw ApiError.badRequest('OpenTable API key appears invalid. Check your credentials.');
  if (!restaurantId || restaurantId.length < 3) throw ApiError.badRequest('OpenTable restaurant ID appears invalid.');
}

async function verifyResDiaryCredentials(apiKey: string, restaurantId: string): Promise<void> {
  const res = await fetch(`https://api.resdiary.com/api/v1/restaurant/${encodeURIComponent(restaurantId)}`, {
    headers: { Authorization: `ApiKey ${apiKey}` },
  });
  if (res.status === 401) throw ApiError.badRequest('ResDiary API key is invalid. Check your credentials and try again.');
  if (res.status === 404) throw ApiError.badRequest('ResDiary restaurant ID not found. Check your restaurant ID.');
  if (!res.ok) throw ApiError.badRequest(`ResDiary returned an unexpected error (${res.status}). Please try again.`);
}

async function verifyCollinsCredentials(apiKey: string, venueId: string): Promise<void> {
  // Collins does not have a public REST API for validation — format check only
  if (!apiKey || apiKey.length < 8) throw ApiError.badRequest('Collins API key appears invalid. Check your credentials.');
  if (!venueId || venueId.length < 3) throw ApiError.badRequest('Collins venue ID appears invalid.');
}

const VERIFIERS: Record<string, (config: Record<string, string>) => Promise<void>> = {
  Square:    (c) => verifySquareCredentials(c.accessToken),
  Clover:    (c) => verifyCloverCredentials(c.accessToken, c.merchantId),
  resOS:     (c) => verifyResOsCredentials(c.apiKey, c.restaurantId),
  SumUp:     (c) => verifySumUpCredentials(c.apiKey, c.merchantCode),
  Zettle:    (c) => verifyZettleCredentials(c.apiKey),
  OpenTable: (c) => verifyOpenTableCredentials(c.apiKey, c.restaurantId),
  ResDiary:  (c) => verifyResDiaryCredentials(c.apiKey, c.restaurantId),
  Collins:   (c) => verifyCollinsCredentials(c.apiKey, c.venueId),
};

// ─── List connected integrations ─────────────────────────────────────────────

export const listIntegrations = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const integrations = await prisma.integration.findMany({
    where: { businessId, status: 'CONNECTED' },
    orderBy: { name: 'asc' },
  });
  res.json(integrations);
});

// ─── Connect integration (credential-based) ──────────────────────────────────

export const connectIntegration = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const { name, category, config } = req.body as { name: string; category: string; config?: Record<string, string> };
  if (!name || !category) throw ApiError.badRequest('name and category are required');

  const verifier = VERIFIERS[name];
  if (verifier && config && Object.keys(config).length > 0) {
    await verifier(config);
  }

  const integration = await prisma.integration.upsert({
    where: { businessId_name: { businessId, name } },
    update: { status: 'CONNECTED', config: config || {}, lastSynced: new Date() },
    create: { businessId, name, category, status: 'CONNECTED', config: config || {}, lastSynced: new Date() },
  });
  res.json(integration);
});

// ─── Disconnect integration ───────────────────────────────────────────────────

export const disconnectIntegration = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const existing = await prisma.integration.findFirst({ where: { id: req.params.id, businessId } });
  if (!existing) throw ApiError.notFound('Integration not found');
  const integration = await prisma.integration.update({
    where: { id: req.params.id },
    data: { status: 'AVAILABLE', config: Prisma.JsonNull, lastSynced: null },
  });
  res.json(integration);
});

// ─── Get integration status ───────────────────────────────────────────────────

export const getIntegrationStatus = asyncHandler(async (req: Request, res: Response) => {
  const integration = await prisma.integration.findUnique({ where: { id: req.params.id } });
  if (!integration) throw ApiError.notFound('Integration not found');
  res.json({ id: integration.id, name: integration.name, status: integration.status, lastSynced: integration.lastSynced });
});

// ─── Stripe Connect — initiate OAuth ─────────────────────────────────────────
// Redirects the authenticated business owner to Stripe's OAuth consent screen.

export const stripeConnectInit = asyncHandler(async (req: Request, res: Response) => {
  if (!env.STRIPE_CONNECT_CLIENT_ID) throw ApiError.badRequest('Stripe Connect is not configured on this platform.');

  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');

  // Encode businessId + HMAC signature in state so the callback can verify it wasn't tampered with
  const payload = JSON.stringify({ businessId, ts: Date.now() });
  const sig = crypto.createHmac('sha256', env.JWT_SECRET).update(payload).digest('hex');
  const state = Buffer.from(JSON.stringify({ payload, sig })).toString('base64url');

  const params = new URLSearchParams({
    client_id: env.STRIPE_CONNECT_CLIENT_ID,
    response_type: 'code',
    scope: 'read_write',
    redirect_uri: `${env.BACKEND_URL}/api/integrations/stripe/callback`,
    state,
    'stripe_user[business_type]': 'company',
  });

  res.json({ url: `https://connect.stripe.com/oauth/authorize?${params.toString()}` });
});

// ─── Stripe Connect — OAuth callback ─────────────────────────────────────────
// Stripe redirects here after the business authorises. Exchanges code for accountId,
// saves as Integration, then redirects back to the dashboard integrations page.

export const stripeConnectCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  const frontendIntegrationsUrl = `${env.FRONTEND_URL}/#/dashboard/integrations`;

  if (error) {
    console.error('[Stripe Connect] OAuth error:', error, error_description);
    return res.redirect(`${frontendIntegrationsUrl}?stripe_error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${frontendIntegrationsUrl}?stripe_error=missing_params`);
  }

  let businessId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    const { payload, sig } = decoded;
    const expectedSig = crypto.createHmac('sha256', env.JWT_SECRET).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
      throw new Error('signature mismatch');
    }
    businessId = JSON.parse(payload).businessId;
  } catch {
    return res.redirect(`${frontendIntegrationsUrl}?stripe_error=invalid_state`);
  }

  try {
    const response = await stripe.oauth.token({ grant_type: 'authorization_code', code });
    const connectedAccountId = response.stripe_user_id;

    if (!connectedAccountId) throw new Error('No stripe_user_id in response');

    await prisma.integration.upsert({
      where: { businessId_name: { businessId, name: 'Stripe' } },
      update: { status: 'CONNECTED', config: { accountId: connectedAccountId }, lastSynced: new Date() },
      create: {
        businessId,
        name: 'Stripe',
        category: 'payment',
        status: 'CONNECTED',
        config: { accountId: connectedAccountId },
        lastSynced: new Date(),
      },
    });

    return res.redirect(`${frontendIntegrationsUrl}?stripe_connected=1`);
  } catch (err: any) {
    console.error('[Stripe Connect] Token exchange failed:', err);
    return res.redirect(`${frontendIntegrationsUrl}?stripe_error=${encodeURIComponent(err.message || 'connection_failed')}`);
  }
});

// ─── Stripe Connect — disconnect ─────────────────────────────────────────────

export const stripeConnectDisconnect = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');

  const integration = await prisma.integration.findFirst({
    where: { businessId, name: 'Stripe', status: 'CONNECTED' },
  });
  if (!integration) throw ApiError.notFound('Stripe Connect integration not found');

  const cfg = integration.config as any;

  // Deauthorise on Stripe side (best effort)
  if (cfg?.accountId && env.STRIPE_CONNECT_CLIENT_ID) {
    try {
      await stripe.oauth.deauthorize({ client_id: env.STRIPE_CONNECT_CLIENT_ID, stripe_user_id: cfg.accountId });
    } catch (err) {
      console.warn('[Stripe Connect] Deauthorise failed (ignored):', err);
    }
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: { status: 'AVAILABLE', config: Prisma.JsonNull, lastSynced: null },
  });

  res.json({ success: true });
});
