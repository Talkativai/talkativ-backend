import { z } from 'zod';

export const updateBusinessSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional().or(z.literal('')),
  primaryLanguage: z.string().optional(),
  timezone: z.string().optional(),
  openingHours: z.record(z.string()).optional(),
});

export const onboardingBusinessSchema = z.object({
  name: z.string().min(1, 'Business name is required'),
  type: z.string().min(1, 'Business type is required'),
  address: z.string().min(1, 'Address is required'),
  phone: z.string().min(1, 'Phone number is required'),
  openingHours: z.record(z.union([z.string(), z.object({ is24h: z.string().optional(), open: z.boolean().optional(), openTime: z.string().optional(), closeTime: z.string().optional() })])).optional(),
});
