import { Router } from 'express';
import express from 'express';
import { webhookLimiter } from '../middleware/rateLimiter.js';
import { verifyToolSecret, verifyTwilioSignature } from '../middleware/webhookAuth.js';
import * as webhookController from '../controllers/webhook.controller.js';

const router = Router();

// Stripe webhook needs raw body for signature verification
router.post('/stripe', express.raw({ type: 'application/json' }), webhookLimiter, webhookController.stripeWebhook);

// ElevenLabs webhook (kept for backward compat — commented out when fully migrated)
router.post('/elevenlabs', webhookLimiter, webhookController.elevenlabsWebhook);

// Twilio inbound call → creates Ultravox session and returns TwiML
router.post('/public/twilio-inbound', verifyTwilioSignature, webhookController.twilioInboundCall);

// Ultravox post-call hook — saves transcript when a call ends
router.post('/public/ultravox-call-ended', webhookController.ultravoxCallEnded);

// Transfer call tool (called by Ultravox agent to trigger Twilio call transfer)
router.post('/public/transfer-call', webhookLimiter, verifyToolSecret, webhookController.transferCall);

// Public tool endpoints (called by Ultravox during calls — authenticated via x-webhook-secret)
router.post('/public/catalogue-lookup', webhookLimiter, verifyToolSecret, webhookController.catalogueLookup);
router.post('/public/create-order', webhookLimiter, verifyToolSecret, webhookController.createOrder);
router.post('/public/check-availability', webhookLimiter, verifyToolSecret, webhookController.checkAvailability);
router.post('/public/create-reservation', webhookLimiter, verifyToolSecret, webhookController.createReservation);
router.post('/public/get-reservation', webhookLimiter, verifyToolSecret, webhookController.getReservation);
router.post('/public/cancel-reservation', webhookLimiter, verifyToolSecret, webhookController.cancelReservation);
router.post('/public/update-reservation', webhookLimiter, verifyToolSecret, webhookController.updateReservation);
router.post('/public/check-hours', webhookLimiter, verifyToolSecret, webhookController.checkHours);
router.post('/public/check-delivery', webhookLimiter, verifyToolSecret, webhookController.checkDeliveryAddress);
router.post('/public/confirm-payment', webhookLimiter, verifyToolSecret, webhookController.confirmPayment);
router.post('/public/notify-transfer', webhookLimiter, verifyToolSecret, webhookController.notifyTransfer);
router.post('/public/upsell-suggestions', webhookLimiter, verifyToolSecret, webhookController.getUpsellSuggestions);
router.post('/public/caller-history', webhookLimiter, verifyToolSecret, webhookController.getCallerHistory);

// Twilio SMS delivery-status callback — logs queued/sent/delivered/failed transitions
router.post('/public/sms-status', verifyTwilioSignature, webhookController.smsStatus);

// POS payment return — Square / SumUp redirect here after the customer pays.
// Uses GET because payment providers redirect browsers via 302.
router.get('/public/pos-payment-return', webhookController.posPaymentReturn);

export default router;
