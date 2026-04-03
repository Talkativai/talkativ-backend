import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as analytics from '../services/analytics.service.js';

export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const stats = await analytics.getDashboardStats(businessId);
  res.json(stats);
});

export const getRecentCalls = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const calls = await prisma.call.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  res.json(calls);
});

export const getAgentStatus = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const agent = await prisma.agent.findUnique({ where: { businessId } });
  res.json({
    isActive: agent?.isActive ?? false,
    name: agent?.name ?? 'Not configured',
    voiceName: agent?.voiceName ?? 'N/A',
  });
});

export const getChartData = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const data = await analytics.getWeeklyChartData(businessId);
  res.json(data);
});
