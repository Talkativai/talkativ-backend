import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import {
  getStats,
  listUsers,
  deleteUser,
  suspendUser,
  unsuspendUser,
  getIntegrationStats,
} from '../controllers/admin.controller.js';

const router = Router();

// All admin routes require authentication + ADMIN role
router.use(authenticate, requireAdmin);

router.get('/stats', getStats);
router.get('/users', listUsers);
router.delete('/users/:id', deleteUser);
router.post('/users/:id/suspend', suspendUser);
router.post('/users/:id/unsuspend', unsuspendUser);
router.get('/integrations', getIntegrationStats);

export default router;
