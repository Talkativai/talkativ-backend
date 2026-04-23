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
  GROWTH: 9900,  // £99 in pence
  PRO: 17900,    // £179 in pence
} as const;

// ─── ElevenLabs Voices ───────────────────────────────────────────────────────
// All voices use the eleven_turbo_v2_5 model — natural, low-latency, phone-grade
export const AVAILABLE_VOICES = [
  // ── Female ──────────────────────────────────────────────────────────────────
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',   gender: 'female', accent: 'American', description: 'Warm & professional' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: 'female', accent: 'American', description: 'Friendly & bright' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'female', accent: 'American', description: 'Knowledgeable & upbeat' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice',   gender: 'female', accent: 'British',  description: 'Clear & engaging' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',    gender: 'female', accent: 'British',  description: 'Confident & velvety' },
  // ── Male ────────────────────────────────────────────────────────────────────
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric',    gender: 'male',   accent: 'American', description: 'Smooth & trustworthy' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris',   gender: 'male',   accent: 'American', description: 'Charming & down-to-earth' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',  gender: 'male',   accent: 'British',  description: 'Steady & professional' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George',  gender: 'male',   accent: 'British',  description: 'Warm & captivating' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian',   gender: 'male',   accent: 'American', description: 'Deep & comforting' },
  // ── Neutral ─────────────────────────────────────────────────────────────────
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River',   gender: 'neutral', accent: 'American', description: 'Calm & relaxed' },
] as const;
