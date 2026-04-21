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

  // Query params MUST go before the # so React Router (HashRouter) can match the route.
  // /#/dashboard/integrations?foo=1 → React Router sees path "/dashboard/integrations?foo=1" (broken)
  // /?foo=1#/dashboard/integrations  → React Router sees path "/dashboard/integrations", search "?foo=1" (correct)
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  // Use #/dashboard (not #/dashboard/integrations) — dashboard uses state-based nav, not URL sub-paths.
  // DashboardApp reads ?stripe_connected=1 from window.location.search to auto-open Integrations.
  const hashPath = '#/dashboard';

  if (error) {
    console.error('[Stripe Connect] OAuth error:', error, error_description);
    return res.redirect(`${base}?stripe_error=${encodeURIComponent(error_description || error)}${hashPath}`);
  }

  if (!code || !state) {
    return res.redirect(`${base}?stripe_error=missing_params${hashPath}`);
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
    return res.redirect(`${base}?stripe_error=invalid_state${hashPath}`);
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

    return res.redirect(`${base}?stripe_connected=1${hashPath}`);
  } catch (err: any) {
    console.error('[Stripe Connect] Token exchange failed:', err);
    return res.redirect(`${base}?stripe_error=${encodeURIComponent(err.message || 'connection_failed')}${hashPath}`);
  }
});

// ─── Set primary payment integration ─────────────────────────────────────────

export const setPrimaryIntegration = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');

  const integration = await prisma.integration.findFirst({ where: { id: req.params.id, businessId, status: 'CONNECTED' } });
  if (!integration) throw ApiError.notFound('Integration not found');

  // Clear primary flag from all payment integrations for this business
  await prisma.integration.updateMany({
    where: { businessId, category: 'ordering' },
    data: { isPrimary: false },
  });
  // Also clear Stripe Connect (payment category)
  await prisma.integration.updateMany({
    where: { businessId, name: 'Stripe' },
    data: { isPrimary: false },
  });

  // Set this one as primary
  const updated = await prisma.integration.update({
    where: { id: req.params.id },
    data: { isPrimary: true },
  });

  res.json(updated);
});

// ─── Shared OAuth state helpers ──────────────────────────────────────────────

function buildOAuthState(businessId: string): string {
  const payload = JSON.stringify({ businessId, ts: Date.now() });
  const sig = crypto.createHmac('sha256', env.JWT_SECRET).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, sig })).toString('base64url');
}

function parseOAuthState(state: string): string {
  const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
  const { payload, sig } = decoded;
  const expectedSig = crypto.createHmac('sha256', env.JWT_SECRET).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
    throw new Error('signature mismatch');
  }
  return JSON.parse(payload).businessId;
}

// ─── Square OAuth ─────────────────────────────────────────────────────────────

export const squareConnectInit = asyncHandler(async (req: Request, res: Response) => {
  if (!env.SQUARE_CLIENT_ID) throw ApiError.badRequest('Square OAuth is not configured on this platform.');
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');

  const state = buildOAuthState(businessId);
  const squareBase = env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';

  const params = new URLSearchParams({
    client_id: env.SQUARE_CLIENT_ID,
    response_type: 'code',
    scope: 'MERCHANT_PROFILE_READ ITEMS_READ ITEMS_WRITE ORDERS_READ ORDERS_WRITE',
    redirect_uri: `${env.BACKEND_URL}/api/integrations/square/callback`,
    state,
  });

  res.json({ url: `${squareBase}/oauth2/authorize?${params.toString()}` });
});

export const squareConnectCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  const hashPath = '#/dashboard';

  if (error || !code || !state) {
    return res.redirect(`${base}?square_error=${encodeURIComponent(error || 'missing_params')}${hashPath}`);
  }

  let businessId: string;
  try { businessId = parseOAuthState(state); }
  catch { return res.redirect(`${base}?square_error=invalid_state${hashPath}`); }

  try {
    // Exchange code for token
    const tokenRes = await fetch('https://connect.squareup.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-02-22' },
      body: JSON.stringify({
        client_id: env.SQUARE_CLIENT_ID,
        client_secret: env.SQUARE_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${env.BACKEND_URL}/api/integrations/square/callback`,
      }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.message || 'Token exchange failed');
    }

    const accessToken: string = tokenData.access_token;
    const merchantId: string = tokenData.merchant_id || '';

    // Fetch first active location to get locationId
    const squareBase = env.SQUARE_ENVIRONMENT === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';
    const locRes = await fetch(`${squareBase}/v2/locations`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Square-Version': '2024-02-22' },
    });
    const locData = await locRes.json() as any;
    const locationId = locData.locations?.find((l: any) => l.status === 'ACTIVE')?.id
      || locData.locations?.[0]?.id || '';

    await prisma.integration.upsert({
      where: { businessId_name: { businessId, name: 'Square' } },
      update: { status: 'CONNECTED', config: { accessToken, locationId, merchantId }, lastSynced: new Date() },
      create: { businessId, name: 'Square', category: 'ordering', status: 'CONNECTED', config: { accessToken, locationId, merchantId }, lastSynced: new Date() },
    });

    return res.redirect(`${base}?square_connected=1${hashPath}`);
  } catch (err: any) {
    console.error('[Square OAuth] Error:', err);
    return res.redirect(`${base}?square_error=${encodeURIComponent(err.message || 'connection_failed')}${hashPath}`);
  }
});

// ─── Clover OAuth ─────────────────────────────────────────────────────────────

export const cloverConnectInit = asyncHandler(async (req: Request, res: Response) => {
  if (!env.CLOVER_APP_ID) throw ApiError.badRequest('Clover OAuth is not configured on this platform.');
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');

  const state = buildOAuthState(businessId);
  const cloverBase = env.CLOVER_ENVIRONMENT === 'production'
    ? 'https://www.clover.com'
    : 'https://sandbox.dev.clover.com';

  const params = new URLSearchParams({
    client_id: env.CLOVER_APP_ID,
    redirect_uri: `${env.BACKEND_URL}/api/integrations/clover/callback`,
    state,
  });

  res.json({ url: `${cloverBase}/oauth/authorize?${params.toString()}` });
});

export const cloverConnectCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code, merchant_id, state, error } = req.query as Record<string, string>;
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  const hashPath = '#/dashboard';

  if (error || !code || !state) {
    return res.redirect(`${base}?clover_error=${encodeURIComponent(error || 'missing_params')}${hashPath}`);
  }

  let businessId: string;
  try { businessId = parseOAuthState(state); }
  catch { return res.redirect(`${base}?clover_error=invalid_state${hashPath}`); }

  try {
    const cloverApiBase = env.CLOVER_ENVIRONMENT === 'production'
      ? 'https://api.clover.com'
      : 'https://apisandbox.dev.clover.com';

    const tokenRes = await fetch(`${cloverApiBase}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.CLOVER_APP_ID,
        client_secret: env.CLOVER_APP_SECRET,
        code,
      }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.message || 'Token exchange failed');
    }

    const accessToken: string = tokenData.access_token;
    const merchantId: string = merchant_id || tokenData.merchant_id || '';

    await prisma.integration.upsert({
      where: { businessId_name: { businessId, name: 'Clover' } },
      update: { status: 'CONNECTED', config: { accessToken, merchantId }, lastSynced: new Date() },
      create: { businessId, name: 'Clover', category: 'ordering', status: 'CONNECTED', config: { accessToken, merchantId }, lastSynced: new Date() },
    });

    return res.redirect(`${base}?clover_connected=1${hashPath}`);
  } catch (err: any) {
    console.error('[Clover OAuth] Error:', err);
    return res.redirect(`${base}?clover_error=${encodeURIComponent(err.message || 'connection_failed')}${hashPath}`);
  }
});

// ─── SumUp OAuth ──────────────────────────────────────────────────────────────

export const sumupConnectInit = asyncHandler(async (req: Request, res: Response) => {
  if (!env.SUMUP_CLIENT_ID) throw ApiError.badRequest('SumUp OAuth is not configured on this platform.');
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');

  const state = buildOAuthState(businessId);
  const params = new URLSearchParams({
    client_id: env.SUMUP_CLIENT_ID,
    response_type: 'code',
    scope: 'payments transactions.history user.profile',
    redirect_uri: `${env.BACKEND_URL}/api/integrations/sumup/callback`,
    state,
  });

  res.json({ url: `https://api.sumup.com/authorize?${params.toString()}` });
});

export const sumupConnectCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  const hashPath = '#/dashboard';

  if (error || !code || !state) {
    return res.redirect(`${base}?sumup_error=${encodeURIComponent(error || 'missing_params')}${hashPath}`);
  }

  let businessId: string;
  try { businessId = parseOAuthState(state); }
  catch { return res.redirect(`${base}?sumup_error=invalid_state${hashPath}`); }

  try {
    const tokenRes = await fetch('https://api.sumup.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: env.SUMUP_CLIENT_ID,
        client_secret: env.SUMUP_CLIENT_SECRET,
        code,
        redirect_uri: `${env.BACKEND_URL}/api/integrations/sumup/callback`,
      }).toString(),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.message || 'Token exchange failed');
    }

    const accessToken: string = tokenData.access_token;

    // Fetch merchant profile to get merchant code
    const meRes = await fetch('https://api.sumup.com/v0.1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meData = await meRes.json() as any;
    const merchantCode: string = meData.merchant_profile?.merchant_code || '';

    await prisma.integration.upsert({
      where: { businessId_name: { businessId, name: 'SumUp' } },
      update: { status: 'CONNECTED', config: { apiKey: accessToken, merchantCode }, lastSynced: new Date() },
      create: { businessId, name: 'SumUp', category: 'ordering', status: 'CONNECTED', config: { apiKey: accessToken, merchantCode }, lastSynced: new Date() },
    });

    return res.redirect(`${base}?sumup_connected=1${hashPath}`);
  } catch (err: any) {
    console.error('[SumUp OAuth] Error:', err);
    return res.redirect(`${base}?sumup_error=${encodeURIComponent(err.message || 'connection_failed')}${hashPath}`);
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
