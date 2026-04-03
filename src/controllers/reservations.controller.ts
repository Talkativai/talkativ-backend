import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as analytics from '../services/analytics.service.js';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '../utils/constants.js';

export const listReservations = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const page = parseInt(req.query.page as string) || DEFAULT_PAGE;
  const limit = parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE;
  const status = req.query.status as string;

  const where: any = { businessId };
  if (status) where.status = status;

  const [reservations, total] = await Promise.all([
    prisma.reservation.findMany({ where, orderBy: { dateTime: 'asc' }, skip: (page - 1) * limit, take: limit }),
    prisma.reservation.count({ where }),
  ]);

  res.json({ reservations, total, page, totalPages: Math.ceil(total / limit) });
});

export const createReservation = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const reservation = await prisma.reservation.create({
    data: { businessId, ...req.body, dateTime: new Date(req.body.dateTime) },
  });
  res.status(201).json(reservation);
});

export const updateReservation = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const existing = await prisma.reservation.findFirst({ where: { id: req.params.id, businessId } });
  if (!existing) throw ApiError.notFound('Reservation not found');

  const updated = await prisma.reservation.update({
    where: { id: existing.id },
    data: req.body.dateTime ? { ...req.body, dateTime: new Date(req.body.dateTime) } : req.body,
  });
  res.json(updated);
});

export const deleteReservation = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const existing = await prisma.reservation.findFirst({ where: { id: req.params.id, businessId } });
  if (!existing) throw ApiError.notFound('Reservation not found');

  await prisma.reservation.delete({ where: { id: existing.id } });
  res.json({ message: 'Reservation cancelled' });
});

export const getReservationStats = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const stats = await analytics.getReservationStats(businessId);
  res.json(stats);
});
