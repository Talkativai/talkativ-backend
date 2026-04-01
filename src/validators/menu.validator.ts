import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  sortOrder: z.number().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().optional(),
});

export const createItemSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID'),
  name: z.string().min(1, 'Item name is required'),
  description: z.string().optional(),
  price: z.number().positive('Price must be positive'),
});

export const updateItemSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'OUT_OF_STOCK']).optional(),
});

export const SUPPORTED_POS_SYSTEMS = [
  'Clover', 'Square', 'OpenTable', 'Aloha', 'Olo',
  'Lightspeed', 'TouchBistro', 'Revel', 'Micros', 'SpotOn',
] as const;

export type PosSystem = (typeof SUPPORTED_POS_SYSTEMS)[number];

export const importPosSchema = z.object({
  posSystem: z.enum(SUPPORTED_POS_SYSTEMS, { errorMap: () => ({ message: 'Unsupported POS system' }) }),
  credentials: z.record(z.string()).refine(c => Object.keys(c).length > 0, 'Credentials are required'),
});

export const importUrlSchema = z.object({
  url: z
    .string()
    .min(1, 'URL is required')
    .transform((val) => {
      const trimmed = val.trim();
      // Auto-prepend https:// if no protocol is present
      if (!/^https?:\/\//i.test(trimmed)) {
        return `https://${trimmed}`;
      }
      return trimmed;
    })
    .pipe(z.string().url('Please enter a valid URL (e.g. example.com/menu)')),
});
