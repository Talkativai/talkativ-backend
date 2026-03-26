import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as callsController from '../controllers/calls.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', callsController.listCalls);
router.get('/stats', callsController.getCallStats);
router.get('/:id', callsController.getCall);
router.post('/export', callsController.exportCalls);

export default router;
