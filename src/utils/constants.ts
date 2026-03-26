// ─── Pagination ──────────────────────────────────────────────────────────────
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ─── Auth ────────────────────────────────────────────────────────────────────
export const BCRYPT_SALT_ROUNDS = 12;
export const ACCESS_TOKEN_COOKIE_NAME = 'access_token';
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';

// ─── Rate Limits ─────────────────────────────────────────────────────────────
export const AUTH_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 5 };
export const API_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 100 };
export const WEBHOOK_RATE_LIMIT = { windowMs: 60 * 1000, max: 50 };

// ─── Upload ──────────────────────────────────────────────────────────────────
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'];

// ─── Stripe Plans ────────────────────────────────────────────────────────────
export const PLAN_PRICES = {
  STARTER: 19900, // £199 in pence
  GROWTH: 39900,  // £399 in pence
} as const;

// ─── ElevenLabs Voices ───────────────────────────────────────────────────────
export const AVAILABLE_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Aria (Rachel)', gender: 'female', description: 'Warm, conversational' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'female', description: 'Confident' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', gender: 'female', description: 'Soft, pleasant' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', gender: 'female', description: 'Young, friendly' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male', description: 'Well-rounded' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'male', description: 'Crisp, professional' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male', description: 'Deep, authoritative' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'male', description: 'Raspy, casual' },
] as const;
