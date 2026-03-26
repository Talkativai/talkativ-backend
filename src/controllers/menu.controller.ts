import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as extractionService from '../services/extraction.service.js';
import type { CategorizedData } from '../services/gemini.service.js';
import type { PosSystem } from '../validators/menu.validator.js';

const buildCategorizedResponse = (categorized: CategorizedData, created: number, skipped: number) => {
  const menuCats = categorized.menu?.categories || [];
  return {
    menu: {
      found: menuCats.length > 0,
      totalItems: menuCats.reduce((sum, c) => sum + c.items.length, 0),
      savedItems: created,
      duplicatesSkipped: skipped,
      categories: menuCats.map((c) => ({ name: c.name, itemCount: c.items.length })),
    },
    hours: { found: !!categorized.hours },
    contact: { found: !!categorized.contact },
    faq: { found: (categorized.faq?.length || 0) > 0, count: categorized.faq?.length || 0 },
    summary: { found: !!categorized.summary },
    other: { found: !!categorized.other },
  };
};

const getBusinessId = async (userId: string) => {
  const biz = await prisma.business.findUnique({ where: { userId } });
  if (!biz) throw ApiError.notFound('Business not found');
  return biz.id;
};

export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const categories = await prisma.menuCategory.findMany({
    where: { businessId },
    include: { _count: { select: { items: true } } },
    orderBy: { sortOrder: 'asc' },
  });
  res.json(categories);
});

export const getCategoryItems = asyncHandler(async (req: Request, res: Response) => {
  const items = await prisma.menuItem.findMany({
    where: { categoryId: req.params.id },
    orderBy: { name: 'asc' },
  });
  res.json(items);
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const category = await prisma.menuCategory.create({ data: { businessId, ...req.body } });
  res.status(201).json(category);
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await prisma.menuCategory.update({ where: { id: req.params.id }, data: req.body });
  res.json(category);
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  await prisma.menuCategory.delete({ where: { id: req.params.id } });
  res.json({ message: 'Category deleted' });
});

export const createItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await prisma.menuItem.create({ data: req.body });
  res.status(201).json(item);
});

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await prisma.menuItem.update({ where: { id: req.params.id }, data: req.body });
  res.json(item);
});

export const deleteItem = asyncHandler(async (req: Request, res: Response) => {
  await prisma.menuItem.delete({ where: { id: req.params.id } });
  res.json({ message: 'Item deleted' });
});

// ─── Import from URL (Gemini-powered web scraping) ──────────────────────────
export const importFromUrl = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const { url } = req.body;

  if (!url) throw ApiError.badRequest('URL is required');

  // Check for duplicate source (prevent re-importing same URL)
  const existingExtraction = await prisma.businessExtraction.findFirst({
    where: { businessId, source: 'url', sourceRef: url },
  });
  if (existingExtraction) {
    res.json({
      message: 'This URL has already been imported. Data was skipped to prevent duplicates.',
      created: 0,
      skipped: 0,
      alreadyImported: true,
    });
    return;
  }

  const result = await extractionService.extractFromUrl(businessId, url);

  res.json({
    message: `Imported ${result.menuItemsCreated} new menu items (${result.duplicatesSkipped} duplicates skipped)`,
    categorized: buildCategorizedResponse(result.categorized, result.menuItemsCreated, result.duplicatesSkipped),
  });
});

// ─── Import from PDF (Google Vision OCR) ────────────────────────────────────
export const importFromPdf = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No file uploaded');
  const businessId = await getBusinessId(req.user!.userId);
  const fileName = req.file.originalname || req.file.filename;

  const result = await extractionService.extractFromPdf(businessId, req.file.path, fileName);

  res.json({
    message: `Imported ${result.menuItemsCreated} new menu items from PDF`,
    categorized: buildCategorizedResponse(result.categorized, result.menuItemsCreated, result.duplicatesSkipped),
  });
});

// ─── Import from Image (Google Vision OCR) ──────────────────────────────────
export const importFromImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No image uploaded');
  const businessId = await getBusinessId(req.user!.userId);
  const fileName = req.file.originalname || req.file.filename;

  const result = await extractionService.extractFromImage(businessId, req.file.path, fileName);

  res.json({
    message: `Imported ${result.menuItemsCreated} new menu items from image`,
    categorized: buildCategorizedResponse(result.categorized, result.menuItemsCreated, result.duplicatesSkipped),
  });
});

// ─── Unified file import (PDF / DOCX / PNG) ─────────────────────────────────
export const importFromFile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No file uploaded');
  const businessId = await getBusinessId(req.user!.userId);
  const mime = req.file.mimetype;
  const fileName = req.file.originalname || req.file.filename;

  let result: Awaited<ReturnType<typeof extractionService.extractFromPdf>>;

  if (mime === 'application/pdf') {
    result = await extractionService.extractFromPdf(businessId, req.file.path, fileName);
  } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    result = await extractionService.extractFromDocx(businessId, req.file.path, fileName);
  } else if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg') {
    result = await extractionService.extractFromImage(businessId, req.file.path, fileName);
  } else {
    throw ApiError.badRequest('Unsupported file type. Please upload a PDF, DOCX, or PNG.');
  }

  res.json({
    message: `Imported ${result.menuItemsCreated} new items from ${fileName}`,
    categorized: buildCategorizedResponse(result.categorized, result.menuItemsCreated, result.duplicatesSkipped),
  });
});

// ─── POS credential requirements ────────────────────────────────────────────
const POS_REQUIRED_FIELDS: Record<PosSystem, string[]> = {
  Clover:      ['accessToken', 'merchantId'],
  Square:      ['accessToken', 'locationId'],
  OpenTable:   ['restaurantId', 'apiKey'],
  Aloha:       ['apiKey', 'siteId'],
  Olo:         ['apiKey', 'restaurantId'],
  Lightspeed:  ['apiKey', 'accountId'],
  TouchBistro: ['apiKey', 'locationId'],
  Revel:       ['apiKey', 'establishmentId'],
  Micros:      ['apiKey', 'locationId'],
};

// Per-POS fetch — extend each case with real API calls as integrations are built
async function fetchMenuFromPos(
  posSystem: PosSystem,
  credentials: Record<string, string>,
): Promise<{ itemCount: number; categories: { name: string; itemCount: number }[] }> {
  switch (posSystem) {
    case 'Square': {
      const resp = await fetch(
        `https://connect.squareup.com/v2/catalog/list?types=ITEM`,
        { headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Square-Version': '2024-02-22' } },
      );
      if (!resp.ok) throw ApiError.badRequest(`Square API error: ${resp.status} — check your Access Token`);
      const data = await resp.json() as { objects?: { type: string; item_data?: { name: string; category?: { name: string } } }[] };
      const items = (data.objects || []).filter(o => o.type === 'ITEM');
      // Group into a single synthetic category for now
      return { itemCount: items.length, categories: [{ name: 'Imported from Square', itemCount: items.length }] };
    }
    case 'Clover': {
      const resp = await fetch(
        `https://api.clover.com/v3/merchants/${credentials.merchantId}/items?expand=categories&limit=500`,
        { headers: { Authorization: `Bearer ${credentials.accessToken}` } },
      );
      if (!resp.ok) throw ApiError.badRequest(`Clover API error: ${resp.status} — check your Access Token and Merchant ID`);
      const data = await resp.json() as { elements?: { name: string }[] };
      const items = data.elements || [];
      return { itemCount: items.length, categories: [{ name: 'Imported from Clover', itemCount: items.length }] };
    }
    default:
      // All other POS systems: credentials validated, sync queued for manual processing
      return { itemCount: 0, categories: [] };
  }
}

// ─── Import from POS ─────────────────────────────────────────────────────────
export const importFromPos = asyncHandler(async (req: Request, res: Response) => {
  const businessId = await getBusinessId(req.user!.userId);
  const { posSystem, credentials } = req.body as { posSystem: PosSystem; credentials: Record<string, string> };

  // Validate required credential fields for this POS
  const required = POS_REQUIRED_FIELDS[posSystem] || [];
  const missing = required.filter(f => !credentials[f]?.trim());
  if (missing.length) {
    throw ApiError.badRequest(`Missing required fields for ${posSystem}: ${missing.join(', ')}`);
  }

  // Upsert the integration record to CONNECTED with these credentials
  await prisma.integration.updateMany({
    where: { businessId, name: posSystem },
    data: { status: 'CONNECTED', config: credentials, lastSynced: new Date() },
  });

  // Attempt to fetch menu from the POS
  const { itemCount, categories } = await fetchMenuFromPos(posSystem, credentials);

  const hasRealSync = ['Square', 'Clover'].includes(posSystem);

  res.json({
    posSystem,
    synced: hasRealSync,
    message: hasRealSync
      ? `Connected to ${posSystem} — ${itemCount} item${itemCount !== 1 ? 's' : ''} found`
      : `${posSystem} credentials saved. Your menu will sync within 24 hours once the integration is activated.`,
    itemCount,
    categories,
  });
});
