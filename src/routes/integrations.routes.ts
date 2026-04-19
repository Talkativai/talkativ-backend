import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as integrationsController from '../controllers/integrations.controller.js';

const router = Router();

// ─── Stripe Connect OAuth (callback must be public — Stripe redirects here without auth cookie) ──
router.get('/stripe/callback', integrationsController.stripeConnectCallback);

// ─── All other routes require authentication ──────────────────────────────────
router.use(authenticate);

router.get('/', integrationsController.listIntegrations);
router.post('/connect', integrationsController.connectIntegration);

// Stripe Connect — must be defined before /:id routes to avoid "stripe" matching as an ID
router.get('/stripe/connect', integrationsController.stripeConnectInit);
router.delete('/stripe/disconnect', integrationsController.stripeConnectDisconnect);

router.delete('/:id/disconnect', integrationsController.disconnectIntegration);
router.get('/:id/status', integrationsController.getIntegrationStatus);

export default router;
