import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { changePasswordSchema, createStaffSchema, updateStaffSchema } from '../validators/auth.validator.js';
import * as settingsController from '../controllers/settings.controller.js';

const router = Router();
router.use(authenticate);

// Business
router.get('/business', settingsController.getBusinessSettings);
router.put('/business', settingsController.updateBusinessSettings);

// Notifications
router.get('/notifications', settingsController.getNotifications);
router.put('/notifications', settingsController.updateNotifications);

// Phone
router.get('/phone', settingsController.getPhoneConfig);
router.put('/phone', settingsController.updatePhoneConfig);

// Password
router.put('/password', validate(changePasswordSchema), settingsController.changePassword);

// Sessions
router.get('/sessions', settingsController.getSessions);
router.delete('/sessions/:id', settingsController.revokeSession);

// Ordering Policy
router.get('/ordering-policy', settingsController.getOrderingPolicy);
router.put('/ordering-policy', settingsController.updateOrderingPolicy);

// Reservation Policy
router.get('/reservation-policy', settingsController.getReservationPolicy);
router.put('/reservation-policy', settingsController.updateReservationPolicy);

// Staff management
router.get('/staff', settingsController.getStaff);
router.post('/staff', validate(createStaffSchema), settingsController.createStaff);
router.put('/staff/:id', validate(updateStaffSchema), settingsController.updateStaff);
router.delete('/staff/:id', settingsController.deleteStaff);

// 2FA / OTP
router.post('/send-otp', settingsController.sendOtp);
router.post('/verify-otp', settingsController.verifyOtp);

export default router;
