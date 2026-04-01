import fs from 'fs';
import prisma from '../config/db.js';
import * as claudeService from './claude.service.js';
import * as visionService from './google-vision.service.js';
import type { CategorizedData } from './claude.service.js';

type SaveResult = { menuItemsCreated: number; duplicatesSkipped: number; faqsCreated: number; faqsDuplicated: number };

// ─── Extract + categorize from URL ──────────────────────────────────────────
export const extractFromUrl = async (
  businessId: string,
  url: string
): Promise<{ categorized: CategorizedData } & SaveResult> => {
  // Scrape and get raw text
  const rawText = await claudeService.scrapeAndAnalyzeUrl(url);

  // AI categorization
  const categorized = await claudeService.categorizeExtractedData(rawText, 'url');

  // Save extraction record
  await prisma.businessExtraction.create({
    data: {
      businessId,
      source: 'url',
      sourceRef: url,
      category: 'all',
      rawText: rawText.substring(0, 5000),
      structuredData: categorized as any,
    },
  });

  // Save categorized data to DB
  const result = await saveExtractedDataToDb(businessId, categorized);

  return { categorized, ...result };
};

// ─── Extract + categorize from PDF ──────────────────────────────────────────
export const extractFromPdf = async (
  businessId: string,
  filePath: string,
  fileName: string
): Promise<{ categorized: CategorizedData } & SaveResult> => {
  console.log('[extractFromPdf] called with:', filePath);
  console.log('[extractFromPdf] file exists:', fs.existsSync(filePath));

  const categorized = await claudeService.extractAndCategorizeFromPdf(filePath);
  try { fs.unlinkSync(filePath); } catch {}

  console.log('[extractFromPdf] Claude result:', JSON.stringify(categorized, null, 2));

  await prisma.businessExtraction.create({
    data: {
      businessId,
      source: 'pdf',
      sourceRef: fileName,
      category: 'all',
      rawText: '',
      structuredData: categorized as any,
    },
  });

  const result = await saveExtractedDataToDb(businessId, categorized);
  return { categorized, ...result };
};

// ─── Extract + categorize from DOCX ─────────────────────────────────────────
export const extractFromDocx = async (
  businessId: string,
  filePath: string,
  fileName: string
): Promise<{ categorized: CategorizedData } & SaveResult> => {
  const rawText = await visionService.extractTextFromDocx(filePath);
  try { fs.unlinkSync(filePath); } catch {}

  const categorized = await claudeService.categorizeExtractedData(rawText, 'pdf');

  await prisma.businessExtraction.create({
    data: {
      businessId,
      source: 'docx',
      sourceRef: fileName,
      category: 'all',
      rawText: rawText.substring(0, 5000),
      structuredData: categorized as any,
    },
  });

  const result = await saveExtractedDataToDb(businessId, categorized);
  return { categorized, ...result };
};

// ─── Extract + categorize from Image ────────────────────────────────────────
export const extractFromImage = async (
  businessId: string,
  filePath: string,
  fileName: string,
  mimeType: string
): Promise<{ categorized: CategorizedData } & SaveResult> => {
  console.log('[extractFromImage] called with:', filePath, mimeType);
  console.log('[extractFromImage] file exists:', fs.existsSync(filePath));

  const categorized = await claudeService.extractAndCategorizeFromImage(filePath, mimeType);
  try { fs.unlinkSync(filePath); } catch {}

  console.log('[extractFromImage] Claude result:', JSON.stringify(categorized, null, 2));

  await prisma.businessExtraction.create({
    data: {
      businessId,
      source: 'image',
      sourceRef: fileName,
      category: 'all',
      rawText: '',
      structuredData: categorized as any,
    },
  });

  const result = await saveExtractedDataToDb(businessId, categorized);
  return { categorized, ...result };
};

// ─── Save extracted data to appropriate DB models ───────────────────────────
async function saveExtractedDataToDb(
  businessId: string,
  data: CategorizedData
): Promise<SaveResult> {
  let menuItemsCreated = 0;
  let duplicatesSkipped = 0;
  let faqsCreated = 0;
  let faqsDuplicated = 0;

  // 1. Menu items → MenuCategory + MenuItem (deduplicated per category)
  if (data.menu?.categories?.length > 0) {
    const existingCategories = await prisma.menuCategory.findMany({
      where: { businessId },
      include: { items: { select: { name: true } } },
    });

    for (const cat of data.menu.categories) {
      // Build a set of existing item names scoped to THIS category only
      const existingDbCat = existingCategories.find(
        (c) => c.name.toLowerCase() === cat.name.toLowerCase()
      );
      const categoryItemNames = new Set(
        (existingDbCat?.items ?? []).map((i) => i.name.toLowerCase())
      );

      // Partition into new vs duplicate before touching the DB
      const newItems = cat.items.filter(
        (item) => !categoryItemNames.has(item.name.toLowerCase())
      );
      duplicatesSkipped += cat.items.length - newItems.length;

      // Skip category creation entirely if nothing new to save
      if (newItems.length === 0) continue;

      let savedCategory = existingDbCat;
      if (!savedCategory) {
        savedCategory = await prisma.menuCategory.create({
          data: { businessId, name: cat.name },
        }) as any;
      }

      for (const item of newItems) {
        await prisma.menuItem.create({
          data: {
            categoryId: savedCategory!.id,
            name: item.name,
            description: item.description || null,
            price: item.price || 0,
          },
        });
        menuItemsCreated++;
      }
    }
  }

  // 2. Hours → Business.openingHours (only save if not already set)
  if (data.hours?.schedule) {
    const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { openingHours: true } });
    if (!biz?.openingHours) {
      await prisma.business.update({
        where: { id: businessId },
        data: { openingHours: data.hours.schedule as any },
      });
    }
  }

  // 3. Contact → Business fields (only fill empty fields, never overwrite)
  if (data.contact) {
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (business) {
      const fill: Record<string, string> = {};
      if (data.contact.email   && !(business as any).email)   fill.email   = data.contact.email;
      if (data.contact.website && !(business as any).website) fill.website = data.contact.website;
      if (data.contact.phone   && !(business as any).phone)   fill.phone   = data.contact.phone;
      if (data.contact.address && !(business as any).address) fill.address = data.contact.address;
      if (Object.keys(fill).length > 0) {
        await prisma.business.update({ where: { id: businessId }, data: fill });
      }
    }
  }

  // 4. FAQs → Faq table (deduplicated by question, case-insensitive)
  if (data.faq && data.faq.length > 0) {
    const existingFaqs = await prisma.faq.findMany({ where: { businessId } });
    const existingQuestions = new Set(existingFaqs.map((f) => f.question.toLowerCase()));
    let position = existingFaqs.length;

    for (const faq of data.faq) {
      if (existingQuestions.has(faq.question.toLowerCase())) {
        faqsDuplicated++;
        continue;
      }
      await prisma.faq.create({
        data: { businessId, question: faq.question, answer: faq.answer, position: position++ },
      });
      existingQuestions.add(faq.question.toLowerCase());
      faqsCreated++;
    }
  }

  // 5. Summary → BusinessExtraction (only if none exists yet)
  if (data.summary) {
    const existing = await prisma.businessExtraction.findFirst({
      where: { businessId, category: 'summary' },
    });
    if (!existing) {
      await prisma.businessExtraction.create({
        data: { businessId, source: 'ai', category: 'summary', rawText: data.summary },
      });
    }
  }

  return { menuItemsCreated, duplicatesSkipped, faqsCreated, faqsDuplicated };
}
