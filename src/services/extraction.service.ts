import fs from 'fs';
import prisma from '../config/db.js';
import * as groqService from './groq.service.js';
import * as visionService from './google-vision.service.js';
import type { CategorizedData } from './groq.service.js';

// ─── Extract + categorize from URL ──────────────────────────────────────────
export const extractFromUrl = async (
  businessId: string,
  url: string
): Promise<{ categorized: CategorizedData; menuItemsCreated: number; duplicatesSkipped: number }> => {
  // Scrape and get raw text
  const rawText = await groqService.scrapeAndAnalyzeUrl(url);

  // AI categorization
  const categorized = await groqService.categorizeExtractedData(rawText, 'url');

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
): Promise<{ categorized: CategorizedData; menuItemsCreated: number; duplicatesSkipped: number }> => {
  console.log('[extractFromPdf] called with:', filePath);
  console.log('[extractFromPdf] file exists:', fs.existsSync(filePath));

  const rawText = await visionService.extractTextFromPdf(filePath);
  try { fs.unlinkSync(filePath); } catch {}

  console.log('[extractFromPdf] pdf-parse text length:', rawText.length);
  console.log('[extractFromPdf] pdf-parse preview:', rawText.substring(0, 500));

  const categorized = await groqService.categorizeExtractedData(rawText, 'pdf');

  console.log('[extractFromPdf] Groq result:', JSON.stringify(categorized, null, 2));

  await prisma.businessExtraction.create({
    data: {
      businessId,
      source: 'pdf',
      sourceRef: fileName,
      category: 'all',
      rawText: rawText.substring(0, 5000),
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
): Promise<{ categorized: CategorizedData; menuItemsCreated: number; duplicatesSkipped: number }> => {
  const rawText = await visionService.extractTextFromDocx(filePath);
  try { fs.unlinkSync(filePath); } catch {}

  const categorized = await groqService.categorizeExtractedData(rawText, 'pdf');

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
  fileName: string
): Promise<{ categorized: CategorizedData; menuItemsCreated: number; duplicatesSkipped: number }> => {
  console.log('[extractFromImage] called with:', filePath);
  console.log('[extractFromImage] file exists:', fs.existsSync(filePath));

  const rawText = await visionService.extractTextFromImage(filePath);
  try { fs.unlinkSync(filePath); } catch {}

  console.log('[extractFromImage] Tesseract text length:', rawText.length);
  console.log('[extractFromImage] Tesseract preview:', rawText.substring(0, 500));

  const categorized = await groqService.categorizeExtractedData(rawText, 'image');

  console.log('[extractFromImage] Groq result:', JSON.stringify(categorized, null, 2));

  await prisma.businessExtraction.create({
    data: {
      businessId,
      source: 'image',
      sourceRef: fileName,
      category: 'all',
      rawText: rawText.substring(0, 5000),
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
): Promise<{ menuItemsCreated: number; duplicatesSkipped: number }> {
  let menuItemsCreated = 0;
  let duplicatesSkipped = 0;

  // 1. Save menu items (with deduplication)
  if (data.menu?.categories?.length > 0) {
    // Get existing items for deduplication
    const existingCategories = await prisma.menuCategory.findMany({
      where: { businessId },
      include: { items: { select: { name: true } } },
    });
    const existingItemNames = new Set(
      existingCategories.flatMap((c) => c.items.map((i) => i.name.toLowerCase()))
    );

    for (const cat of data.menu.categories) {
      // Find or create category
      let dbCategory = existingCategories.find(
        (c) => c.name.toLowerCase() === cat.name.toLowerCase()
      );
      if (!dbCategory) {
        dbCategory = await prisma.menuCategory.create({
          data: { businessId, name: cat.name },
        }) as any;
      }

      // Add items (skip duplicates)
      for (const item of cat.items) {
        if (existingItemNames.has(item.name.toLowerCase())) {
          duplicatesSkipped++;
          continue;
        }

        await prisma.menuItem.create({
          data: {
            categoryId: dbCategory!.id,
            name: item.name,
            description: item.description || null,
            price: item.price || 0,
          },
        });
        existingItemNames.add(item.name.toLowerCase());
        menuItemsCreated++;
      }
    }
  }

  // 2. Save/update business hours if found
  if (data.hours?.schedule) {
    await prisma.business.update({
      where: { id: businessId },
      data: { openingHours: data.hours.schedule as any },
    });
  }

  // 3. Save/update contact info if found
  if (data.contact) {
    const updateData: Record<string, string> = {};
    if (data.contact.email) updateData.email = data.contact.email;
    if (data.contact.website) updateData.website = data.contact.website;
    if (data.contact.phone) updateData.phone = data.contact.phone;
    if (data.contact.address) updateData.address = data.contact.address;

    if (Object.keys(updateData).length > 0) {
      // Only update empty fields (don't overwrite existing data)
      const business = await prisma.business.findUnique({ where: { id: businessId } });
      if (business) {
        const filteredUpdate: Record<string, string> = {};
        for (const [key, value] of Object.entries(updateData)) {
          if (!(business as any)[key]) {
            filteredUpdate[key] = value;
          }
        }
        if (Object.keys(filteredUpdate).length > 0) {
          await prisma.business.update({
            where: { id: businessId },
            data: filteredUpdate,
          });
        }
      }
    }
  }

  // 4. Save FAQs as extraction record
  if (data.faq && data.faq.length > 0) {
    const existingFaq = await prisma.businessExtraction.findFirst({
      where: { businessId, category: 'faq' },
    });
    if (existingFaq) {
      // Merge: append new FAQ entries not already present
      const existing = (existingFaq.structuredData as any)?.faq as Array<{ question: string; answer: string }> || [];
      const existingQuestions = new Set(existing.map((f) => f.question.toLowerCase()));
      const newEntries = data.faq.filter((f) => !existingQuestions.has(f.question.toLowerCase()));
      if (newEntries.length > 0) {
        await prisma.businessExtraction.update({
          where: { id: existingFaq.id },
          data: { structuredData: { faq: [...existing, ...newEntries] } as any },
        });
      }
    } else {
      await prisma.businessExtraction.create({
        data: {
          businessId,
          source: 'ai',
          category: 'faq',
          rawText: data.faq.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n'),
          structuredData: { faq: data.faq } as any,
        },
      });
    }
  }

  // 5. Save business summary as extraction record
  if (data.summary) {
    const existingSummary = await prisma.businessExtraction.findFirst({
      where: { businessId, category: 'summary' },
    });
    if (!existingSummary) {
      await prisma.businessExtraction.create({
        data: {
          businessId,
          source: 'ai',
          category: 'summary',
          rawText: data.summary,
        },
      });
    }
  }

  return { menuItemsCreated, duplicatesSkipped };
}
