import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as dashboardController from '../controllers/dashboard.controller.js';

const router = Router();

router.use(authenticate);

router.get('/stats', dashboardController.getStats);
router.get('/recent-calls', dashboardController.getRecentCalls);
router.get('/agent-status', dashboardController.getAgentStatus);
router.get('/chart-data', dashboardController.getChartData);

export default router;
