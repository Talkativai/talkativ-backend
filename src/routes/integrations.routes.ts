import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as integrationsController from '../controllers/integrations.controller.js';

const router = Router();

// ─── OAuth callbacks (public — provider redirects here without auth cookie) ───
router.get('/stripe/callback', integrationsController.stripeConnectCallback);
router.get('/square/callback', integrationsController.squareConnectCallback);
router.get('/clover/callback', integrationsController.cloverConnectCallback);
router.get('/sumup/callback', integrationsController.sumupConnectCallback);

// ─── All other routes require authentication ──────────────────────────────────
router.use(authenticate);

router.get('/', integrationsController.listIntegrations);
router.post('/connect', integrationsController.connectIntegration);

// OAuth init endpoints — must be before /:id routes
router.get('/stripe/connect', integrationsController.stripeConnectInit);
router.delete('/stripe/disconnect', integrationsController.stripeConnectDisconnect);
router.get('/square/connect', integrationsController.squareConnectInit);
router.get('/clover/connect', integrationsController.cloverConnectInit);
router.get('/sumup/connect', integrationsController.sumupConnectInit);

router.delete('/:id/disconnect', integrationsController.disconnectIntegration);
router.put('/:id/set-primary', integrationsController.setPrimaryIntegration);
router.get('/:id/status', integrationsController.getIntegrationStatus);

export default router;
