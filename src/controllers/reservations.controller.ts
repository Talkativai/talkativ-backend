import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as analytics from '../services/analytics.service.js';
import * as resosService from '../services/resos.service.js';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '../utils/constants.js';

export const listReservations = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const page = parseInt(req.query.page as string) || DEFAULT_PAGE;
  const limit = Math.min(parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE, 100);
  const status = req.query.status as string;

  const where: any = { businessId };
  if (status) where.status = status;

  const [reservations, total] = await Promise.all([
    prisma.reservation.findMany({
      where,
      orderBy: { dateTime: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { call: true },
    }),
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

// ─── Live integration reservations (read-only pull from resOS/ResDiary) ──────
export const getLiveIntegrationReservations = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');

  const integration = await prisma.integration.findFirst({
    where: {
      businessId,
      name: { in: ['resOS', 'ResDiary'] },
      status: 'CONNECTED',
    },
  });

  if (!integration?.config) {
    res.json({ source: null, reservations: [] });
    return;
  }

  const cfg = integration.config as Record<string, string>;
  let rawList: any[] = [];

  try {
    if (integration.name === 'resOS' && cfg.apiKey && cfg.propertyId) {
      rawList = await resosService.listResOSReservations(cfg.apiKey, cfg.propertyId);
    } else if (integration.name === 'ResDiary' && cfg.apiKey && cfg.restaurantId) {
      const resp = await fetch(
        `https://api.resdiary.com/api/v1/restaurant/${encodeURIComponent(cfg.restaurantId)}/reservations`,
        { headers: { Authorization: `ApiKey ${cfg.apiKey}` } },
      );
      rawList = resp.ok ? (await resp.json() as any[]) : [];
    }
  } catch (err: any) {
    console.error('[Integration Reservations]', err.message);
    res.json({ source: null, reservations: [] });
    return;
  }

  // Normalize and enrich with Talkativ DB data (deposit, call linkage, talkativRef)
  const externalIds = rawList
    .map(r => r.id || r.reservation_id)
    .filter(Boolean)
    .map(String);

  const dbRecords = externalIds.length
    ? await prisma.reservation.findMany({
        where: { businessId, externalId: { in: externalIds } },
        include: { call: true },
      })
    : [];

  const dbByExtId = new Map(dbRecords.map(r => [r.externalId, r]));

  const reservations = rawList.map((r: any) => {
    const extId = String(r.id || r.reservation_id || '');
    const db = dbByExtId.get(extId);
    return {
      // Integration data
      source: integration.name,
      externalId: extId,
      guestName: r.guest_name || r.firstName ? `${r.firstName || ''} ${r.lastName || ''}`.trim() : r.name || '',
      guestPhone: r.guest_phone || r.phone || null,
      guests: r.covers || r.guests || r.covers_count || 0,
      dateTime: r.date_time || r.visitDateTime || r.start_time || null,
      status: r.status ? String(r.status).toUpperCase() : 'CONFIRMED',
      note: r.notes || r.note || null,
      // Talkativ enrichment (if this reservation was made via Talkativ)
      talkativRef: db?.talkativRef || null,
      depositPaid: db?.depositPaid || false,
      depositAmount: db?.depositAmount ? Number(db.depositAmount) : 0,
      call: db?.call || null,
    };
  });

  res.json({ source: integration.name, reservations });
});

export const getReservationStats = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const stats = await analytics.getReservationStats(businessId);
  res.json(stats);
});
