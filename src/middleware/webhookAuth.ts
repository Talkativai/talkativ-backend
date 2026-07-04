import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import twilio from 'twilio';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

// ─── Ultravox tool-webhook authentication ────────────────────────────────────
// The AI agent's HTTP tools (create-order, caller-history, etc.) are called by
// Ultravox during a live call. Each tool sends the shared secret in the
// `x-webhook-secret` header (attached in buildAgentTools via staticParameters).
// This middleware rejects any request that doesn't present the correct secret,
// closing the previously-open surface where anyone could POST to these routes
// with an arbitrary business_id.
//
// If AGENT_WEBHOOK_SECRET is not configured we log a loud warning and allow the
// request through, so an un-provisioned deploy doesn't silently break calls —
// but production MUST set this value.
export const verifyToolSecret = (req: Request, _res: Response, next: NextFunction) => {
  const expected = env.AGENT_WEBHOOK_SECRET;

  if (!expected) {
    console.warn('[Security] AGENT_WEBHOOK_SECRET is not set — tool webhooks are UNPROTECTED. Set it in the environment.');
    return next();
  }

  const provided = req.headers['x-webhook-secret'];
  if (typeof provided !== 'string' || !timingSafeEqual(provided, expected)) {
    return next(ApiError.unauthorized('Invalid or missing webhook secret'));
  }

  next();
};

// Constant-time comparison to avoid leaking the secret via timing.
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ─── Twilio inbound webhook signature validation ─────────────────────────────
// Twilio signs every webhook with an X-Twilio-Signature header computed from the
// full request URL + POST params + your auth token. This proves the request came
// from Twilio and not a spoofer trying to spin up billable calls.
//
// Rolled out in 'warn' mode by default (see TWILIO_VALIDATE_SIGNATURE): failures
// are logged but the call still proceeds, so we gather real telemetry before
// flipping to 'enforce'. The public URL is reconstructed from BACKEND_URL because
// the app runs behind Render's TLS-terminating proxy, where req.protocol/host are
// unreliable.
export const verifyTwilioSignature = (req: Request, _res: Response, next: NextFunction) => {
  const mode = env.TWILIO_VALIDATE_SIGNATURE;
  if (mode === 'off' || !env.TWILIO_AUTH_TOKEN) return next();

  const signature = req.headers['x-twilio-signature'] as string | undefined;
  const url = `${env.BACKEND_URL}${req.originalUrl}`;
  const valid = signature
    ? twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, req.body || {})
    : false;

  if (valid) return next();

  if (mode === 'enforce') {
    return next(ApiError.unauthorized('Invalid Twilio signature'));
  }

  // warn mode — log but allow through
  console.warn(`[Security] Twilio signature validation FAILED for ${url} (mode=warn, allowing through). ` +
    `Set TWILIO_VALIDATE_SIGNATURE=enforce once real traffic is confirmed passing.`);
  next();
};
