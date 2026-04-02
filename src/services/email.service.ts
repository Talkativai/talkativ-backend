// ─── Nodemailer implementation (commented out — replaced by Resend) ──────────
//
// import nodemailer from 'nodemailer';
// import { env } from '../config/env.js';
//
// const transporter = nodemailer.createTransport({
//   host: env.SMTP_HOST,
//   port: env.SMTP_PORT,
//   secure: env.SMTP_PORT === 465,
//   auth: {
//     user: env.SMTP_USER,
//     pass: env.SMTP_PASS,
//   },
// });
//
// const from = `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`;
//
// export const sendEmail = async (params: { to: string; subject: string; html: string }) => {
//   return transporter.sendMail({ from, to: params.to, subject: params.subject, html: params.html });
// };
// ─────────────────────────────────────────────────────────────────────────────

import { Resend } from 'resend';
import { env } from '../config/env.js';

const resend = new Resend(env.RESEND_API_KEY);
const from = `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`;

// ─── Generic Email ───────────────────────────────────────────────────────────
export const sendEmail = async (params: { to: string; subject: string; html: string }) => {
  return resend.emails.send({ from, to: [params.to], subject: params.subject, html: params.html });
};

// ─── Email Templates ─────────────────────────────────────────────────────────

export const sendWelcomeEmail = async (to: string, firstName: string) => {
  return resend.emails.send({
    from,
    to: [to],
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
    to: [to],
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
    to: [to],
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
    to: [to],
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
    to: [to],
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
    to: [to],
    subject: `Your trial ends in ${daysLeft} days — Talkativ`,
    html: `
      <h1>Trial Ending Soon</h1>
      <p>Your Talkativ trial ends in <strong>${daysLeft} days</strong>.</p>
      <p>Upgrade your plan to keep your AI agent running.</p>
    `,
  });
};

export const sendPasswordChangeAlert = async (to: string, firstName: string, recoveryUrl: string) => {
  return resend.emails.send({
    from,
    to: [to],
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
    to: [to],
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

export const sendStaffCredentials = async (to: string, firstName: string, businessName: string, username: string, password: string) => {
  return resend.emails.send({
    from,
    to: [to],
    subject: `You've been added to ${businessName} on Talkativ`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#7035f5,#4b1ab5);padding:32px 36px;">
          <h1 style="color:white;margin:0;font-size:24px;font-weight:800;letter-spacing:-.5px;">Welcome to the team, ${firstName}! 👋</h1>
          <p style="color:rgba(255,255,255,.8);margin:10px 0 0;font-size:14px;">You've been added as a staff member at <strong>${businessName}</strong></p>
        </div>
        <div style="padding:32px 36px;">
          <p style="color:#2d2150;font-size:14px;margin:0 0 24px;">Here are your login credentials for the Talkativ staff dashboard. Keep these safe — the password won't be shown again.</p>
          <div style="background:#f8f6ff;border:1.5px solid #ece5ff;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <div style="margin-bottom:16px;">
              <div style="font-size:11px;font-weight:700;color:#9e92ba;letter-spacing:.6px;text-transform:uppercase;margin-bottom:6px;">Username</div>
              <div style="font-size:16px;font-weight:700;color:#130d2e;font-family:monospace;letter-spacing:.5px;">${username}</div>
            </div>
            <div>
              <div style="font-size:11px;font-weight:700;color:#9e92ba;letter-spacing:.6px;text-transform:uppercase;margin-bottom:6px;">Password</div>
              <div style="font-size:16px;font-weight:700;color:#130d2e;font-family:monospace;letter-spacing:.5px;">${password}</div>
            </div>
          </div>
          <p style="color:#9e92ba;font-size:12px;margin:0;line-height:1.6;">If you did not expect this email, you can safely ignore it. Contact your business owner if you have any questions.</p>
        </div>
      </div>
    `,
  });
};

export const sendRefundRequestAlert = async (to: string, guestName: string, reservationId: string, amount: string) => {
  return resend.emails.send({
    from,
    to: [to],
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

export const sendBusinessNewOrderAlert = async (to: string, businessName: string, orderDetails: {
  id: string;
  type: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  deliveryAddress?: string | null;
  items: string;
  notes?: string | null;
  allergies?: string | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
}) => {
  return resend.emails.send({
    from,
    to: [to],
    subject: `🚨 New Order via Talkativ — #${orderDetails.id.slice(0, 8)}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:12px;overflow:hidden;">
        <div style="background:#f2ebfa;padding:24px;border-bottom:1px solid #e1d6f5;">
          <h1 style="color:#2d2150;margin:0;font-size:20px;">New ${orderDetails.type} Order</h1>
          <p style="color:#574c76;font-size:14px;margin:4px 0 0;">Your AI agent just took a new order for ${businessName}.</p>
        </div>
        <div style="padding:24px;">
          <h2 style="font-size:16px;color:#2d2150;margin:0 0 12px;border-bottom:1px solid #eee;padding-bottom:8px;">Customer Details</h2>
          <p style="margin:4px 0;font-size:14px;"><strong>Name:</strong> ${orderDetails.customerName}</p>
          ${orderDetails.customerPhone ? `<p style="margin:4px 0;font-size:14px;"><strong>Phone:</strong> ${orderDetails.customerPhone}</p>` : ''}
          ${orderDetails.customerEmail ? `<p style="margin:4px 0;font-size:14px;"><strong>Email:</strong> ${orderDetails.customerEmail}</p>` : ''}
          ${orderDetails.type === 'DELIVERY' && orderDetails.deliveryAddress ? `<p style="margin:4px 0;font-size:14px;"><strong>Delivery Address:</strong> ${orderDetails.deliveryAddress}</p>` : ''}

          <h2 style="font-size:16px;color:#2d2150;margin:24px 0 12px;border-bottom:1px solid #eee;padding-bottom:8px;">Order Details</h2>
          <p style="margin:4px 0;font-size:14px;"><strong>Items:</strong> ${orderDetails.items}</p>
          ${orderDetails.notes ? `<p style="margin:4px 0;font-size:14px;"><strong>Notes:</strong> ${orderDetails.notes}</p>` : ''}
          ${orderDetails.allergies ? `<div style="background:#fff5f5;border:1px solid #fed7d7;padding:12px;border-radius:8px;margin-top:12px;color:#c53030;font-size:14px;"><strong>⚠️ Allergies:</strong> ${orderDetails.allergies}</div>` : ''}

          <h2 style="font-size:16px;color:#2d2150;margin:24px 0 12px;border-bottom:1px solid #eee;padding-bottom:8px;">Payment Details</h2>
          <table style="width:100%;font-size:14px;color:#2d2150;border-collapse:collapse;">
            <tr><td style="padding:4px 0;">Method</td><td style="text-align:right;padding:4px 0;"><strong>${orderDetails.paymentMethod.replace(/_/g, ' ').toUpperCase()}</strong> (${orderDetails.paymentStatus})</td></tr>
            <tr><td style="padding:4px 0;">Subtotal</td><td style="text-align:right;padding:4px 0;">£${orderDetails.subtotal.toFixed(2)}</td></tr>
            ${orderDetails.deliveryFee > 0 ? `<tr><td style="padding:4px 0;">Delivery Fee</td><td style="text-align:right;padding:4px 0;">£${orderDetails.deliveryFee.toFixed(2)}</td></tr>` : ''}
            <tr><td style="padding:8px 0;font-weight:bold;border-top:1px solid #eee;">Total</td><td style="text-align:right;padding:8px 0;font-weight:bold;border-top:1px solid #eee;">£${orderDetails.total.toFixed(2)}</td></tr>
          </table>
        </div>
      </div>
    `,
  });
};

export const sendBusinessNewReservationAlert = async (to: string, businessName: string, reservationDetails: {
  id: string;
  guestName: string;
  guestPhone?: string | null;
  guestEmail?: string | null;
  guests: number;
  dateTime: Date;
  depositStatus: string;
}) => {
  return resend.emails.send({
    from,
    to: [to],
    subject: `📅 New Reservation via Talkativ — ${reservationDetails.guestName}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:12px;overflow:hidden;">
        <div style="background:#f0faeb;padding:24px;border-bottom:1px solid #d5ecd0;">
          <h1 style="color:#1d3a14;margin:0;font-size:20px;">New Reservation Booked</h1>
          <p style="color:#3d5a34;font-size:14px;margin:4px 0 0;">Your AI agent just booked a table for ${businessName}.</p>
        </div>
        <div style="padding:24px;">
          <h2 style="font-size:16px;color:#1d3a14;margin:0 0 12px;border-bottom:1px solid #eee;padding-bottom:8px;">Booking Details</h2>
          <p style="margin:4px 0;font-size:14px;"><strong>Date & Time:</strong> ${reservationDetails.dateTime.toLocaleString('en-GB')}</p>
          <p style="margin:4px 0;font-size:14px;"><strong>Party Size:</strong> ${reservationDetails.guests} guest${reservationDetails.guests > 1 ? 's' : ''}</p>

          <h2 style="font-size:16px;color:#1d3a14;margin:24px 0 12px;border-bottom:1px solid #eee;padding-bottom:8px;">Guest Info</h2>
          <p style="margin:4px 0;font-size:14px;"><strong>Name:</strong> ${reservationDetails.guestName}</p>
          ${reservationDetails.guestPhone ? `<p style="margin:4px 0;font-size:14px;"><strong>Phone:</strong> ${reservationDetails.guestPhone}</p>` : ''}
          ${reservationDetails.guestEmail ? `<p style="margin:4px 0;font-size:14px;"><strong>Email:</strong> ${reservationDetails.guestEmail}</p>` : ''}

          <h2 style="font-size:16px;color:#1d3a14;margin:24px 0 12px;border-bottom:1px solid #eee;padding-bottom:8px;">Deposit Info</h2>
          <p style="margin:4px 0;font-size:14px;"><strong>Status:</strong> ${reservationDetails.depositStatus}</p>
        </div>
      </div>
    `,
  });
};
