import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as analytics from '../services/analytics.service.js';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '../utils/constants.js';

export const listCalls = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const page = parseInt(req.query.page as string) || DEFAULT_PAGE;
  const limit = parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE;
  const filter = req.query.filter as string; // All, Orders, Enquiries, Missed
  const dateRange = req.query.date as string; // today, yesterday, week, month

  const where: any = { businessId };
  if (filter === 'Orders') where.outcomeType = 'ORDER';
  else if (filter === 'Enquiries') where.outcomeType = 'ENQUIRY';
  else if (filter === 'Missed') where.status = 'MISSED';

  if (dateRange) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (dateRange === 'today') where.createdAt = { gte: now };
    else if (dateRange === 'yesterday') {
      const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
      where.createdAt = { gte: yesterday, lt: now };
    } else if (dateRange === 'week') {
      const week = new Date(now); week.setDate(week.getDate() - 7);
      where.createdAt = { gte: week };
    } else if (dateRange === 'month') {
      const month = new Date(now); month.setMonth(month.getMonth() - 1);
      where.createdAt = { gte: month };
    }
  }

  const [calls, total] = await Promise.all([
    prisma.call.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.call.count({ where }),
  ]);

  res.json({ calls, total, page, totalPages: Math.ceil(total / limit) });
});

export const getCall = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const call = await prisma.call.findFirst({ where: { id: req.params.id, businessId }, include: { order: true } });
  if (!call) throw ApiError.notFound('Call not found');
  res.json(call);
});

export const getCallStats = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const stats = await analytics.getCallStats(businessId);
  res.json(stats);
});

export const exportCalls = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const calls = await prisma.call.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' } });
  const csv = ['ID,Caller,Phone,Status,Outcome,Duration,Date',
    ...calls.map(c => `${c.id},${c.callerName || ''},${c.callerPhone || ''},${c.status},${c.outcome || ''},${c.duration || ''},${c.createdAt.toISOString()}`)
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=calls.csv');
  res.send(csv);
});
