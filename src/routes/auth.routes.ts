import { Router } from 'express';
import { env } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, staffLoginSchema } from '../validators/auth.validator.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

// Public auth routes with hash paths
router.post(`/register/${env.AUTH_REGISTER_HASH}`, authLimiter, validate(registerSchema), authController.register);
router.post(`/login/${env.AUTH_LOGIN_HASH}`, authLimiter, validate(loginSchema), authController.login);
router.post(`/staff-login/${env.AUTH_LOGIN_HASH}`, authLimiter, validate(staffLoginSchema), authController.staffLogin);

// Public token management
router.post('/refresh-token', authLimiter, authController.refreshToken);
router.post('/logout', authController.logout);

// Password reset (public)
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password/:token', authLimiter, validate(resetPasswordSchema), authController.resetPassword);

// Email verification (public)
router.post('/verify-email/:token', authController.verifyEmail);

// Google OAuth
router.get('/google', authController.googleAuthRedirect);
router.get('/google/callback', authController.googleAuthCallback);

export default router;
