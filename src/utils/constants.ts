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

// ─── Cartesia Voices ─────────────────────────────────────────────────────────
// All voices use Cartesia Sonic-2 model via the Ultravox integration.
// IDs are Cartesia voice IDs — verify / replace from your Cartesia dashboard.
// See setup.md for instructions on finding voice IDs.

// ElevenLabs voices (commented out — replaced by Cartesia below):
// { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',   ... }  // ElevenLabs
// { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', ... }  // ElevenLabs
// { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', ... }  // ElevenLabs
// { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice',   ... }  // ElevenLabs
// { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',    ... }  // ElevenLabs
// { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric',    ... }  // ElevenLabs
// { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris',   ... }  // ElevenLabs
// { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',  ... }  // ElevenLabs
// { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George',  ... }  // ElevenLabs
// { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian',   ... }  // ElevenLabs
// { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River',   ... }  // ElevenLabs

export const AVAILABLE_VOICES = [
  // ── Female ──────────────────────────────────────────────────────────────────
  { id: 'b7d50908-b17c-442d-ad8d-810c63997fd9', name: 'Sarah',   gender: 'female', accent: 'American', description: 'Warm & professional' },
  { id: 'c45bc5ec-dc68-4feb-8829-6e6b2748095d', name: 'Jessica', gender: 'female', accent: 'American', description: 'Friendly & bright' },
  { id: '41534e16-2966-4c6b-9670-111411def906', name: 'Matilda', gender: 'female', accent: 'American', description: 'Knowledgeable & upbeat' },
  { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', name: 'Alice',   gender: 'female', accent: 'British',  description: 'Clear & engaging' },
  { id: '95d51f79-c397-46f9-b349-0b14e52ac08b', name: 'Lily',    gender: 'female', accent: 'British',  description: 'Confident & velvety' },
  // ── Male ────────────────────────────────────────────────────────────────────
  { id: 'ed81fd13-2016-4a49-8fe3-c0d2761695fc', name: 'Eric',    gender: 'male',   accent: 'American', description: 'Smooth & trustworthy' },
  { id: 'a0e99841-438c-4a64-b679-ae501e7d6091', name: 'Chris',   gender: 'male',   accent: 'American', description: 'Charming & down-to-earth' },
  { id: '63ff761f-c1e8-414b-b969-d1833d1c870c', name: 'Daniel',  gender: 'male',   accent: 'British',  description: 'Steady & professional' },
  { id: 'f9836c6e-a0bd-460e-9d3c-f7299fa60f94', name: 'George',  gender: 'male',   accent: 'British',  description: 'Warm & captivating' },
  { id: '2ee87190-8f84-4925-97da-e52547f9462c', name: 'Brian',   gender: 'male',   accent: 'American', description: 'Deep & comforting' },
  // ── Neutral ─────────────────────────────────────────────────────────────────
  { id: '694f9389-aac1-45b6-b726-9d9369183238', name: 'River',   gender: 'neutral', accent: 'American', description: 'Calm & relaxed' },
] as const;
