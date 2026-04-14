import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as billingController from '../controllers/billing.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', billingController.getBilling);
router.get('/invoices', billingController.getInvoices);
router.post('/create-setup-intent', billingController.createSetupIntent);
router.post('/subscribe', billingController.subscribe);
router.post('/attach-test-card', billingController.attachTestCard); // test mode only
router.put('/plan', billingController.changePlan);
router.post('/cancel', billingController.cancelSubscription);
router.get('/portal', billingController.getPortal);

export default router;
