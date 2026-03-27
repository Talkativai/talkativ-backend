import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

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

const app = express();
app.set('trust proxy', 1);

// ─── Global Middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
import * as googlePlaces from './services/google-places.service.js';
app.get('/api/public/search-business', apiLimiter, async (req, res) => {
  const query = req.query.q as string;
  if (!query || query.length < 2) {
    res.json({ results: [] });
    return;
  }
  try {
    const results = await googlePlaces.searchBusinesses(query);
    res.json({ results });
  } catch (err: any) {
    console.error('Business search error:', err);
    res.json({ results: [] });
  }
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
