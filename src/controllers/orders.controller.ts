import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as analytics from '../services/analytics.service.js';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '../utils/constants.js';

const getBusinessId = async (userId: string) => {
  const biz = await prisma.business.findUnique({ where: { userId } });
  if (!biz) throw ApiError.notFound('Business not found');
  return biz.id;
};

export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const page = parseInt(req.query.page as string) || DEFAULT_PAGE;
  const limit = parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE;
  const type = req.query.type as string;
  const status = req.query.status as string;

  const where: any = { businessId };
  if (type) where.type = type;
  if (status) where.status = status;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.order.count({ where }),
  ]);

  res.json({ orders, total, page, totalPages: Math.ceil(total / limit) });
});

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const order = await prisma.order.findFirst({ where: { id: req.params.id, businessId }, include: { call: true } });
  if (!order) throw ApiError.notFound('Order not found');
  res.json(order);
});

export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const order = await prisma.order.findFirst({ where: { id: req.params.id, businessId } });
  if (!order) throw ApiError.notFound('Order not found');

  const updated = await prisma.order.update({ where: { id: order.id }, data: { status: req.body.status } });
  res.json(updated);
});

export const getOrderStats = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const stats = await analytics.getOrderStats(businessId);
  res.json(stats);
});

export const exportOrders = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const orders = await prisma.order.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' } });
  const csv = ['ID,Customer,Items,Type,Status,Amount,Date',
    ...orders.map(o => `${o.id},${o.customerName},${o.items},${o.type},${o.status},${o.amount},${o.createdAt.toISOString()}`)
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
  res.send(csv);
});
