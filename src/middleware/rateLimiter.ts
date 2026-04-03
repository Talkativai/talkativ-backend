import rateLimit from 'express-rate-limit';
import { AUTH_RATE_LIMIT, API_RATE_LIMIT, WEBHOOK_RATE_LIMIT } from '../utils/constants.js';

export const authLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT.windowMs,
  max: AUTH_RATE_LIMIT.max,
  message: { error: 'Too many authentication attempts. Please try again later.' },
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
  max: 10, // strict limit for public unauth search to avoid scraper bots
  message: { error: 'Too many search requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
