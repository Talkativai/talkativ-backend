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

// ─── Ultravox Voices ─────────────────────────────────────────────────────────
// IDs are Ultravox voiceIds — fetched from GET /api/voices on 2026-05-06.
// Pass voiceId directly to Ultravox createCallSession (no prefix needed).

// Cartesia voice IDs (commented out — replaced by Ultravox native voices below):
// { id: 'b7d50908-b17c-442d-ad8d-810c63997fd9', name: 'Sarah',   ... }  // Cartesia
// { id: 'c45bc5ec-dc68-4feb-8829-6e6b2748095d', name: 'Jessica', ... }  // Cartesia
// { id: '41534e16-2966-4c6b-9670-111411def906', name: 'Matilda', ... }  // Cartesia
// { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', name: 'Alice',   ... }  // Cartesia
// { id: '95d51f79-c397-46f9-b349-0b14e52ac08b', name: 'Lily',    ... }  // Cartesia
// { id: 'ed81fd13-2016-4a49-8fe3-c0d2761695fc', name: 'Eric',    ... }  // Cartesia
// { id: 'a0e99841-438c-4a64-b679-ae501e7d6091', name: 'Chris',   ... }  // Cartesia
// { id: '63ff761f-c1e8-414b-b969-d1833d1c870c', name: 'Daniel',  ... }  // Cartesia
// { id: 'f9836c6e-a0bd-460e-9d3c-f7299fa60f94', name: 'George',  ... }  // Cartesia
// { id: '2ee87190-8f84-4925-97da-e52547f9462c', name: 'Brian',   ... }  // Cartesia
// { id: '694f9389-aac1-45b6-b726-9d9369183238', name: 'River',   ... }  // Cartesia

// ElevenLabs voice IDs (commented out — replaced by Cartesia, then by Ultravox):
// { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',   ... }  // ElevenLabs
// { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', ... }  // ElevenLabs

export const AVAILABLE_VOICES = [
  // ── Female ──────────────────────────────────────────────────────────────────
  { id: '33175488-b0f9-4f11-a0c6-3f4edd47353e', name: 'Gabrielle', gender: 'female',  accent: 'American',   description: 'Warm & professional' },
  { id: 'edc061c1-8761-4705-a927-934b754f510e', name: 'Karri',     gender: 'female',  accent: 'American',   description: 'Friendly & bright' },
  { id: 'aa601962-1cbd-4bbd-9d96-3c7a93c3414a', name: 'Jacqueline',gender: 'female',  accent: 'American',   description: 'Confident & empathic' },
  { id: '4c8d6eb4-c021-4d56-aec9-656bf6ca6046', name: 'Kai',       gender: 'female',  accent: 'American',   description: 'Warm & southern' },
  { id: 'd20e12df-6fd9-428e-a81f-ba0090de13d9', name: 'Claire',    gender: 'female',  accent: 'British',    description: 'Clear & engaging' },
  { id: '534bb930-9642-4ec3-b5c0-e82426d22add', name: 'Louisamay', gender: 'female',  accent: 'Irish',      description: 'Bright & expressive' },
  { id: '8ff05d3d-d78d-40a6-88c1-dd1efcf571f0', name: 'Hannah',    gender: 'female',  accent: 'Australian', description: 'Knowledgeable & upbeat' },
  // ── Male ────────────────────────────────────────────────────────────────────
  { id: 'ef6757de-79b1-497b-ad54-c6bef635e2b7', name: 'David',     gender: 'male',    accent: 'American',   description: 'Smooth & trustworthy' },
  { id: '199c9635-edbe-4f9c-a626-ca31fb151d15', name: 'Troy',      gender: 'male',    accent: 'American',   description: 'Charming & down-to-earth' },
  { id: '5f8e97b1-cd48-431a-b6a1-3b94306d8914', name: 'Grant',     gender: 'male',    accent: 'American',   description: 'Steady & professional' },
  { id: 'a6afd1fc-960f-45d3-9e46-e8182af650b9', name: 'Clive',     gender: 'male',    accent: 'British',    description: 'Deep & comforting' },
  { id: '280a8e4d-2974-4593-87eb-fb74f0278a2e', name: 'Arlo',      gender: 'male',    accent: 'Australian', description: 'Warm & captivating' },
] as const;
