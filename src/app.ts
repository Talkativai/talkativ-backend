import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import hpp from 'hpp';
import { env } from './config/env.js';
import { apiLimiter, searchLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { xss } from './middleware/xss.js';

// Route imports
import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import businessRoutes from './routes/business.routes.js';
import agentRoutes from './routes/agent.routes.js';
import callsRoutes from './routes/calls.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import reservationsRoutes from './routes/reservations.routes.js';
import menuRoutes from './routes/menu.routes.js';
import integrationsRoutes from './routes/integrations.routes.js';
import billingRoutes from './routes/billing.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import voicesRoutes from './routes/agent.routes.js';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const app = express();
app.set('trust proxy', 1);

// ─── Global Middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(morgan('dev'));
app.use(cookieParser());
// Limit body payload to 10kb to prevent denial of service by large payloads
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
// Data sanitization against NoSQL query injection / XSS
app.use(xss);
// Prevent HTTP parameter pollution
app.use(hpp());

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Talkativ API is running', version: '1.0.0' });
});

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/api/dashboard', apiLimiter, dashboardRoutes);
app.use('/api/business', apiLimiter, businessRoutes);
app.use('/api/agent', apiLimiter, agentRoutes);
app.use('/api/voices', apiLimiter, voicesRoutes);
app.use('/api/calls', apiLimiter, callsRoutes);
app.use('/api/orders', apiLimiter, ordersRoutes);
app.use('/api/reservations', apiLimiter, reservationsRoutes);
app.use('/api/menu', apiLimiter, menuRoutes);
app.use('/api/integrations', apiLimiter, integrationsRoutes);
app.use('/api/billing', apiLimiter, billingRoutes);
app.use('/api/settings', apiLimiter, settingsRoutes);
app.use('/api/upload', apiLimiter, uploadRoutes);

// ─── Webhook Routes (public — no API limiter, own limiter) ───────────────────
app.use('/webhooks', webhookRoutes);
app.use('/api/public', webhookRoutes);

// ─── Public Business Search (for onboarding, no auth needed) ─────────────────
import * as claudeSearch from './services/claude-search.service.js';
import * as twilioService from './services/twilio.service.js';
import { rateLimit } from 'express-rate-limit';

app.get('/api/public/search-business', searchLimiter, async (req, res) => {
  const query = req.query.q as string;
  if (!query || query.length < 2) {
    res.json({ results: [] });
    return;
  }
  try {
    const results = await claudeSearch.searchBusinesses(query);
    res.json({ results });
  } catch (err: any) {
    console.error('Business search error:', err);
    res.json({ results: [] });
  }
});

// ─── Demo Call (public — no auth) ────────────────────────────────────────────
const demoCallLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3, // max 3 demo calls per IP per day
  message: { error: 'Too many demo calls requested. Please try again tomorrow.' },
});

app.post('/api/public/demo-call', demoCallLimiter, async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    res.status(400).json({ error: 'Phone number is required' });
    return;
  }

  if (!twilioService.isValidPhoneNumber(phoneNumber)) {
    res.status(400).json({ error: 'Please enter a valid phone number with country code e.g. +44 7700 000000' });
    return;
  }

  if (!env.ELEVENLABS_DEMO_AGENT_ID) {
    res.status(500).json({ error: 'Demo agent not configured' });
    return;
  }

  const result = await twilioService.makeDemoCall(phoneNumber);

  if (!result.success) {
    res.status(500).json({ error: 'Failed to initiate call. Please try again.' });
    return;
  }

  res.json({ success: true, message: 'Calling you now! Pick up in a few seconds.' });
});

// ─── Public Order/Reservation Details (for payment page) ─────────────────────
app.get('/api/public/order/:id', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { business: { select: { name: true, email: true } } },
  });
  if (!order) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(order);
});

app.get('/api/public/reservation/:id', async (req, res) => {
  const reservation = await prisma.reservation.findUnique({
    where: { id: req.params.id },
    include: { business: { select: { name: true } } },
  });
  if (!reservation) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(reservation);
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
