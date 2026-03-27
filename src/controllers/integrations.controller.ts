import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import { Prisma } from '@prisma/client';

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
