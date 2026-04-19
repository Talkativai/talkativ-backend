import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as reservationsController from '../controllers/reservations.controller.js';

const router = Router();
router.use(authenticate);

router.get('/integration/live', reservationsController.getLiveIntegrationReservations);
router.get('/', reservationsController.listReservations);
router.get('/stats', reservationsController.getReservationStats);
router.post('/', reservationsController.createReservation);
router.put('/:id', reservationsController.updateReservation);
router.delete('/:id', reservationsController.deleteReservation);

export default router;
