import rateLimit from 'express-rate-limit';
import { AUTH_RATE_LIMIT, API_RATE_LIMIT, WEBHOOK_RATE_LIMIT } from '../utils/constants.js';

export const authLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT.windowMs,
  max: AUTH_RATE_LIMIT.max,
  message: { error: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Separate, more permissive limiter for the refresh-token endpoint.
// The refresh token is already protected by the httpOnly cookie + token rotation,
// so brute-force isn't a concern here. The strict authLimiter (5/15 min) was
// exhausting the budget during normal active use, causing unexpected logouts.
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // 60 refreshes per 15 min — ~1 every 15 seconds, far more than any normal session needs
  message: { error: 'Too many token refresh attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: API_RATE_LIMIT.windowMs,
  max: API_RATE_LIMIT.max,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const webhookLimiter = rateLimit({
  windowMs: WEBHOOK_RATE_LIMIT.windowMs,
  max: WEBHOOK_RATE_LIMIT.max,
  message: { error: 'Too many webhook requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 100, // generous — actual cost control is at the API key level
  message: { error: 'Too many search requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
