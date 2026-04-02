import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import { Prisma } from '@prisma/client';

// ─── Credential verification helpers ─────────────────────────────────────────

async function verifySquareCredentials(accessToken: string): Promise<void> {
  const res = await fetch('https://connect.squareup.com/v2/locations', {
    headers: { Authorization: `Bearer ${accessToken}`, 'Square-Version': '2024-01-18' },
  });
  if (res.status === 401) throw ApiError.badRequest('Square access token is invalid. Check your credentials and try again.');
  if (!res.ok) throw ApiError.badRequest(`Square returned an unexpected error (${res.status}). Please try again.`);
}

async function verifyCloverCredentials(accessToken: string, merchantId: string): Promise<void> {
  const res = await fetch(`https://api.clover.com/v3/merchants/${merchantId}`, {
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

const VERIFIERS: Record<string, (config: Record<string, string>) => Promise<void>> = {
  Square: (c) => verifySquareCredentials(c.accessToken),
  Clover: (c) => verifyCloverCredentials(c.accessToken, c.merchantId),
  resOS:  (c) => verifyResOsCredentials(c.apiKey, c.restaurantId),
};

const getBusinessId = async (userId: string) => {
  const biz = await prisma.business.findUnique({ where: { userId } });
  if (!biz) throw ApiError.notFound('Business not found');
  return biz.id;
};

export const listIntegrations = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  // Return only CONNECTED integrations for the main list
  const integrations = await prisma.integration.findMany({
    where: { businessId, status: 'CONNECTED' },
    orderBy: { name: 'asc' },
  });
  res.json(integrations);
});

export const connectIntegration = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const { name, category, config } = req.body as { name: string; category: string; config?: Record<string, string> };
  if (!name || !category) throw ApiError.badRequest('name and category are required');

  // Verify credentials before saving if a verifier exists for this integration
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

export const disconnectIntegration = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const existing = await prisma.integration.findFirst({ where: { id: req.params.id, businessId } });
  if (!existing) throw ApiError.notFound('Integration not found');
  const integration = await prisma.integration.update({
    where: { id: req.params.id },
    data: { status: 'AVAILABLE', config: Prisma.JsonNull, lastSynced: null },
  });
  res.json(integration);
});

export const getIntegrationStatus = asyncHandler(async (req: Request, res: Response) => {
  const integration = await prisma.integration.findUnique({ where: { id: req.params.id } });
  if (!integration) throw ApiError.notFound('Integration not found');
  res.json({ id: integration.id, name: integration.name, status: integration.status, lastSynced: integration.lastSynced });
});
