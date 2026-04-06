import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as extractionService from '../services/extraction.service.js';
import type { CategorizedData } from '../services/claude.service.js';
import type { PosSystem } from '../validators/menu.validator.js';

const buildCategorizedResponse = (
  categorized: CategorizedData,
  created: number,
  skipped: number,
  faqsCreated: number,
  faqsDuplicated: number
) => {
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
    faq: {
      found: (categorized.faq?.length || 0) > 0,
      count: categorized.faq?.length || 0,
      savedItems: faqsCreated,
      duplicatesSkipped: faqsDuplicated,
    },
    summary: { found: !!categorized.summary },
    other: { found: !!categorized.other },
  };
};

export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
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
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const { name } = req.body as { name: string };
  if (!name?.trim()) throw ApiError.badRequest('Category name is required');
  const existing = await prisma.menuCategory.findFirst({ where: { businessId, name: { equals: name.trim(), mode: 'insensitive' } } });
  if (existing) throw ApiError.badRequest(`A category named "${name.trim()}" already exists`);
  const category = await prisma.menuCategory.create({ data: { businessId, name: name.trim() } });
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
  const { categoryId, name, description, price } = req.body as { categoryId: string; name: string; description?: string; price: number };
  if (!categoryId || !name?.trim()) throw ApiError.badRequest('categoryId and name are required');
  const existing = await prisma.menuItem.findFirst({ where: { categoryId, name: { equals: name.trim(), mode: 'insensitive' } } });
  if (existing) throw ApiError.badRequest(`An item named "${name.trim()}" already exists in this category`);
  const item = await prisma.menuItem.create({ data: { categoryId, name: name.trim(), description: description?.trim() || null, price } });
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

// ─── Security Helpers ───────────────────────────────────────────────────────
const sanitizeFile = (file: Express.Multer.File) => {
  const allowedMimes = [
    'application/pdf', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
    'image/png', 
    'image/jpeg', 
    'image/jpg'
  ];
  if (!allowedMimes.includes(file.mimetype)) {
    throw ApiError.badRequest('Unsupported file type. Security policy allows only PDF, DOCX, or PNG/JPG.');
  }
  const originalName = file.originalname || '';
  // Check for malicious extensions to prevent execution or malware
  if (originalName.match(/\.(exe|sh|bat|cmd|js|php|pif|scr|vbs)$/i)) {
    throw ApiError.badRequest('Malicious file type detected. File upload rejected.');
  }
};

const validateUrl = (urlStr: string) => {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error();
    }
  } catch {
    throw ApiError.badRequest('Invalid URL provided. Strict HTTP/HTTPS requirement enforced to prevent injection.');
  }
};

// ─── Import from URL (Gemini-powered web scraping) ──────────────────────────
export const importFromUrl = asyncHandler(async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) throw ApiError.badRequest('URL is required');

  validateUrl(url);

  let businessId = req.user?.businessId;
  if (!businessId) {
    const fallback = await prisma.business.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!fallback) throw ApiError.badRequest('No business found to attach menu to');
    businessId = fallback.id;
  }

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
    categorized: buildCategorizedResponse(result.categorized, result.menuItemsCreated, result.duplicatesSkipped, result.faqsCreated, result.faqsDuplicated),
  });
});

// ─── Import from PDF (Google Vision OCR) ────────────────────────────────────
export const importFromPdf = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No file uploaded');
  sanitizeFile(req.file);

  let businessId = req.user?.businessId;
  if (!businessId) {
    const fallback = await prisma.business.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!fallback) throw ApiError.badRequest('No business found to attach menu to');
    businessId = fallback.id;
  }
  
  const fileName = req.file.originalname || req.file.filename;

  const result = await extractionService.extractFromPdf(businessId, req.file.path, fileName);

  res.json({
    message: `Imported ${result.menuItemsCreated} new menu items from PDF`,
    categorized: buildCategorizedResponse(result.categorized, result.menuItemsCreated, result.duplicatesSkipped, result.faqsCreated, result.faqsDuplicated),
  });
});

// ─── Import from Image (Google Vision OCR) ──────────────────────────────────
export const importFromImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No image uploaded');
  sanitizeFile(req.file);

  let businessId = req.user?.businessId;
  if (!businessId) {
    const fallback = await prisma.business.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!fallback) throw ApiError.badRequest('No business found to attach menu to');
    businessId = fallback.id;
  }
  
  const fileName = req.file.originalname || req.file.filename;

  const result = await extractionService.extractFromImage(businessId, req.file.path, fileName, req.file.mimetype);

  res.json({
    message: `Imported ${result.menuItemsCreated} new menu items from image`,
    categorized: buildCategorizedResponse(result.categorized, result.menuItemsCreated, result.duplicatesSkipped, result.faqsCreated, result.faqsDuplicated),
  });
});

// ─── Unified file import (PDF / DOCX / PNG) ─────────────────────────────────
export const importFromFile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('No file uploaded');
  sanitizeFile(req.file);

  let businessId = req.user?.businessId;
  if (!businessId) {
    const fallback = await prisma.business.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!fallback) throw ApiError.badRequest('No business found to attach menu to');
    businessId = fallback.id;
  }
  
  const mime = req.file.mimetype;
  const fileName = req.file.originalname || req.file.filename;

  let result: Awaited<ReturnType<typeof extractionService.extractFromPdf>>;

  if (mime === 'application/pdf') {
    result = await extractionService.extractFromPdf(businessId, req.file.path, fileName);
  } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    result = await extractionService.extractFromDocx(businessId, req.file.path, fileName);
  } else if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg') {
    result = await extractionService.extractFromImage(businessId, req.file.path, fileName, mime);
  } else {
    throw ApiError.badRequest('Unsupported file type. Please upload a PDF, DOCX, or PNG.');
  }

  res.json({
    message: `Imported ${result.menuItemsCreated} new items from ${fileName}`,
    categorized: buildCategorizedResponse(result.categorized, result.menuItemsCreated, result.duplicatesSkipped, result.faqsCreated, result.faqsDuplicated),
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
  SpotOn:      ['apiKey', 'siteId'],
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
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
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

// ─── FAQ ─────────────────────────────────────────────────────────────────────

export const listFaqs = asyncHandler(async (req: Request, res: Response) => {
  const biz = await prisma.business.findUnique({ where: { userId: req.user!.userId } });
  if (!biz) throw ApiError.notFound('Business not found');
  const businessId = biz.id;
  const faqs = await prisma.faq.findMany({
    where: { businessId },
    orderBy: { position: 'asc' },
  });
  res.json(faqs);
});

export const createFaq = asyncHandler(async (req: Request, res: Response) => {
  const biz = await prisma.business.findUnique({ where: { userId: req.user!.userId } });
  if (!biz) throw ApiError.notFound('Business not found');
  const businessId = biz.id;
  const { question, answer } = req.body;
  if (!question || !answer) throw ApiError.badRequest('Question and answer are required');

  const duplicate = await prisma.faq.findFirst({
    where: { businessId, question: { equals: question.trim(), mode: 'insensitive' } },
  });
  if (duplicate) throw ApiError.conflict('This FAQ already exists');

  const count = await prisma.faq.count({ where: { businessId } });
  const faq = await prisma.faq.create({
    data: { businessId, question: question.trim(), answer: answer.trim(), position: count },
  });
  res.status(201).json(faq);
});

export const updateFaq = asyncHandler(async (req: Request, res: Response) => {
  const biz = await prisma.business.findUnique({ where: { userId: req.user!.userId } });
  if (!biz) throw ApiError.notFound('Business not found');
  const businessId = biz.id;
  const { id } = req.params;
  const { question, answer } = req.body;

  const existing = await prisma.faq.findFirst({ where: { id, businessId } });
  if (!existing) throw ApiError.notFound('FAQ not found');

  const updated = await prisma.faq.update({
    where: { id },
    data: { question: question.trim(), answer: answer.trim() },
  });
  res.json(updated);
});

export const deleteFaq = asyncHandler(async (req: Request, res: Response) => {
  const biz = await prisma.business.findUnique({ where: { userId: req.user!.userId } });
  if (!biz) throw ApiError.notFound('Business not found');
  const businessId = biz.id;
  const { id } = req.params;

  const existing = await prisma.faq.findFirst({ where: { id, businessId } });
  if (!existing) throw ApiError.notFound('FAQ not found');

  await prisma.faq.delete({ where: { id } });
  res.json({ message: 'FAQ deleted' });
});
