import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string(),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  ELEVENLABS_API_KEY: z.string().default(''),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_PUBLIC_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),

  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('noreply@talkativ.io'),
  EMAIL_FROM_NAME: z.string().default('Talkativ'),

  UPLOAD_DIR: z.string().default('./uploads'),
  AGENT_WEBHOOK_SECRET: z.string().default(''),
  BACKEND_URL: z.string().default('http://localhost:5000'),

  AUTH_LOGIN_HASH: z.string(),
  AUTH_REGISTER_HASH: z.string(),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:5000/auth/google/callback'),

  // Groq AI
  GROQ_API_KEY: z.string().default(''),

  // Google API (Places API)
  GOOGLE_API_KEY: z.string().default(''),

  // Stripe price IDs
  STRIPE_STARTER_PRICE_ID: z.string().default(''),
  STRIPE_GROWTH_PRICE_ID: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
