import { Resend } from 'resend';
import { env } from '../config/env.js';

const resend = new Resend(env.RESEND_API_KEY);
const from = `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`;

// ─── Generic Email ───────────────────────────────────────────────────────────
export const sendEmail = async (params: { to: string; subject: string; html: string }) => {
  return resend.emails.send({ from, to: params.to, subject: params.subject, html: params.html });
};

// ─── Email Templates ─────────────────────────────────────────────────────────

export const sendWelcomeEmail = async (to: string, firstName: string) => {
  return resend.emails.send({
    from,
    to,
    subject: 'Welcome to Talkativ! 🎉',
    html: `
      <h1>Welcome, ${firstName}!</h1>
      <p>Thanks for signing up for Talkativ. Your AI phone agent is ready to set up.</p>
      <p>Complete your onboarding to get started.</p>
    `,
  });
};

export const sendPasswordResetEmail = async (to: string, resetUrl: string) => {
  return resend.emails.send({
    from,
    to,
    subject: 'Reset your password — Talkativ',
    html: `
      <h1>Password Reset</h1>
      <p>Click the link below to reset your password:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>This link expires in 1 hour.</p>
    `,
  });
};

export const sendOrderConfirmation = async (to: string, order: { id: string; items: string; amount: string }) => {
  return resend.emails.send({
    from,
    to,
    subject: `Order Confirmed — #${order.id.slice(0, 8)}`,
    html: `
      <h1>New Order Placed</h1>
      <p><strong>Order ID:</strong> ${order.id.slice(0, 8)}</p>
      <p><strong>Items:</strong> ${order.items}</p>
      <p><strong>Total:</strong> £${order.amount}</p>
    `,
  });
};

export const sendMissedCallAlert = async (to: string, callerPhone: string) => {
  return resend.emails.send({
    from,
    to,
    subject: 'Missed Call Alert — Talkativ',
    html: `
      <h1>Missed Call</h1>
      <p>You missed a call from <strong>${callerPhone}</strong>.</p>
      <p>Check your dashboard for more details.</p>
    `,
  });
};

export const sendPaymentReceipt = async (to: string, amount: string, date: string) => {
  return resend.emails.send({
    from,
    to,
    subject: 'Payment Receipt — Talkativ',
    html: `
      <h1>Payment Received</h1>
      <p><strong>Amount:</strong> £${amount}</p>
      <p><strong>Date:</strong> ${date}</p>
      <p>Thank you for your payment.</p>
    `,
  });
};

export const sendTrialEndingEmail = async (to: string, daysLeft: number) => {
  return resend.emails.send({
    from,
    to,
    subject: `Your trial ends in ${daysLeft} days — Talkativ`,
    html: `
      <h1>Trial Ending Soon</h1>
      <p>Your Talkativ trial ends in <strong>${daysLeft} days</strong>.</p>
      <p>upgrade your plan to keep your AI agent running.</p>
    `,
  });
};

export const sendPasswordChangeAlert = async (to: string, firstName: string, recoveryUrl: string) => {
  return resend.emails.send({
    from,
    to,
    subject: 'Your password was changed — Talkativ',
    html: `
      <h1>Password Changed</h1>
      <p>Hi ${firstName}, your Talkativ account password was just changed.</p>
      <p>If this was you, no action is needed.</p>
      <p>If you did not make this change, reset your password immediately:</p>
      <a href="${recoveryUrl}" style="display:inline-block;background:#7035f5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Reset Password</a>
      <p style="margin-top:16px;font-size:12px;color:#888;">This link expires in 1 hour.</p>
    `,
  });
};

export const sendOtpEmail = async (to: string, firstName: string, code: string) => {
  return resend.emails.send({
    from,
    to,
    subject: `Your Talkativ verification code: ${code}`,
    html: `
      <h1>Verification Code</h1>
      <p>Hi ${firstName}, here is your 6-digit verification code:</p>
      <div style="font-size:36px;font-weight:900;letter-spacing:12px;color:#7035f5;margin:24px 0;">${code}</div>
      <p>This code expires in 10 minutes.</p>
      <p>If you did not request this, please ignore this email.</p>
    `,
  });
};

export const sendRefundRequestAlert = async (to: string, guestName: string, reservationId: string, amount: string) => {
  return resend.emails.send({
    from,
    to,
    subject: `Refund request — ${guestName}`,
    html: `
      <h1>Reservation Refund Request</h1>
      <p><strong>Guest:</strong> ${guestName}</p>
      <p><strong>Reservation ID:</strong> ${reservationId.slice(0, 8)}</p>
      <p><strong>Refund amount:</strong> £${amount}</p>
      <p>Log in to your Talkativ dashboard to process this refund.</p>
    `,
  });
};
