import { z } from 'zod';

export const updateOrderStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']),
});

export const createOrderSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  items: z.string().min(1, 'Items are required'),
  itemsJson: z.array(z.object({
    name: z.string(),
    qty: z.number(),
    price: z.number(),
  })).optional(),
  type: z.enum(['DELIVERY', 'COLLECTION']).default('DELIVERY'),
  amount: z.number().positive('Amount must be positive'),
  notes: z.string().optional(),
});
