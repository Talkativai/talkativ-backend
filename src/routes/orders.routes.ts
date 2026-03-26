import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateOrderStatusSchema } from '../validators/order.validator.js';
import * as ordersController from '../controllers/orders.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', ordersController.listOrders);
router.get('/stats', ordersController.getOrderStats);
router.get('/:id', ordersController.getOrder);
router.put('/:id/status', validate(updateOrderStatusSchema), ordersController.updateOrderStatus);
router.post('/export', ordersController.exportOrders);

export default router;
