import { Router } from 'express';
import express from 'express';
import { webhookLimiter } from '../middleware/rateLimiter.js';
import * as webhookController from '../controllers/webhook.controller.js';

const router = Router();

// Stripe webhook needs raw body for signature verification
router.post('/stripe', express.raw({ type: 'application/json' }), webhookLimiter, webhookController.stripeWebhook);

// ElevenLabs webhook (kept for backward compat — commented out when fully migrated)
router.post('/elevenlabs', webhookLimiter, webhookController.elevenlabsWebhook);

// Twilio inbound call → creates Ultravox session and returns TwiML
router.post('/public/twilio-inbound', webhookController.twilioInboundCall);

// Ultravox post-call hook — saves transcript when a call ends
router.post('/public/ultravox-call-ended', webhookController.ultravoxCallEnded);

// Transfer call tool (called by Ultravox agent to trigger Twilio call transfer)
router.post('/public/transfer-call', webhookLimiter, webhookController.transferCall);

// Public tool endpoints (called by Ultravox during calls — no auth)
router.post('/public/catalogue-lookup', webhookLimiter, webhookController.catalogueLookup);
router.post('/public/create-order', webhookLimiter, webhookController.createOrder);
router.post('/public/check-availability', webhookLimiter, webhookController.checkAvailability);
router.post('/public/create-reservation', webhookLimiter, webhookController.createReservation);
router.post('/public/get-reservation', webhookLimiter, webhookController.getReservation);
router.post('/public/cancel-reservation', webhookLimiter, webhookController.cancelReservation);
router.post('/public/update-reservation', webhookLimiter, webhookController.updateReservation);
router.post('/public/check-hours', webhookLimiter, webhookController.checkHours);
router.post('/public/check-delivery', webhookLimiter, webhookController.checkDeliveryAddress);
router.post('/public/confirm-payment', webhookLimiter, webhookController.confirmPayment);
router.post('/public/notify-transfer', webhookLimiter, webhookController.notifyTransfer);
router.post('/public/upsell-suggestions', webhookLimiter, webhookController.getUpsellSuggestions);
router.post('/public/caller-history', webhookLimiter, webhookController.getCallerHistory);

// POS payment return — Square / SumUp redirect here after the customer pays.
// Uses GET because payment providers redirect browsers via 302.
router.get('/public/pos-payment-return', webhookController.posPaymentReturn);

export default router;
