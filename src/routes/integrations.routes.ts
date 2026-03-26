import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as integrationsController from '../controllers/integrations.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', integrationsController.listIntegrations);
router.post('/:id/connect', integrationsController.connectIntegration);
router.delete('/:id/disconnect', integrationsController.disconnectIntegration);
router.get('/:id/status', integrationsController.getIntegrationStatus);

export default router;
