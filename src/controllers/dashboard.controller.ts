import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as analytics from '../services/analytics.service.js';

export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const business = await prisma.business.findUnique({ where: { userId: req.user!.userId } });
  if (!business) throw ApiError.notFound('Business not found');

  const stats = await analytics.getDashboardStats(business.id);
  res.json(stats);
});

export const getRecentCalls = asyncHandler(async (req: Request, res: Response) => {
  const business = await prisma.business.findUnique({ where: { userId: req.user!.userId } });
  if (!business) throw ApiError.notFound('Business not found');

  const calls = await prisma.call.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  res.json(calls);
});

export const getAgentStatus = asyncHandler(async (req: Request, res: Response) => {
  const business = await prisma.business.findUnique({
    where: { userId: req.user!.userId },
    include: { agent: true },
  });
  if (!business) throw ApiError.notFound('Business not found');

  res.json({
    isActive: business.agent?.isActive ?? false,
    name: business.agent?.name ?? 'Not configured',
    voiceName: business.agent?.voiceName ?? 'N/A',
  });
});

export const getChartData = asyncHandler(async (req: Request, res: Response) => {
  const business = await prisma.business.findUnique({ where: { userId: req.user!.userId } });
  if (!business) throw ApiError.notFound('Business not found');

  const data = await analytics.getWeeklyChartData(business.id);
  res.json(data);
});
