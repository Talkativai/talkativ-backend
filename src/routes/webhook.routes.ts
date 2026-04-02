import { Router } from 'express';
import express from 'express';
import { webhookLimiter } from '../middleware/rateLimiter.js';
import * as webhookController from '../controllers/webhook.controller.js';

const router = Router();

// Stripe webhook needs raw body for signature verification
router.post('/stripe', express.raw({ type: 'application/json' }), webhookLimiter, webhookController.stripeWebhook);

// ElevenLabs webhook
router.post('/elevenlabs', webhookLimiter, webhookController.elevenlabsWebhook);

// Public tool endpoints (called by ElevenLabs during calls — no auth)
router.post('/public/catalogue-lookup', webhookLimiter, webhookController.catalogueLookup);
router.post('/public/create-order', webhookLimiter, webhookController.createOrder);
router.post('/public/create-reservation', webhookLimiter, webhookController.createReservation);
router.post('/public/check-hours', webhookLimiter, webhookController.checkHours);
router.post('/public/check-delivery', webhookLimiter, webhookController.checkDeliveryAddress);

export default router;
