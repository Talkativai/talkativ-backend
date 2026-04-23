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
      <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#7035f5,#4b1ab5);padding:32px 36px;">
          <h1 style="color:white;margin:0;font-size:24px;font-weight:800;letter-spacing:-.5px;">Welcome, ${firstName}! 🎉</h1>
          <p style="color:rgba(255,255,255,.8);margin:10px 0 0;font-size:14px;">Thanks for signing up for Talkativ.</p>
        </div>
        <div style="padding:32px 36px;">
          <p style="color:#2d2150;font-size:15px;line-height:1.6;margin:0 0 24px;">Your AI phone agent is ready to set up. Complete your onboarding to get started and deploy your agent in minutes.</p>
        </div>
      </div>
    `,
  });
};

export const sendPasswordResetEmail = async (to: string, resetUrl: string) => {
  return resend.emails.send({
    from,
    to: [to],
    subject: 'Reset your password — Talkativ',
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:#f8f6ff;padding:32px 36px;border-bottom:1px solid #ece5ff;">
          <h1 style="color:#130d2e;margin:0;font-size:20px;font-weight:700;">Password Reset</h1>
        </div>
        <div style="padding:32px 36px;">
          <p style="color:#2d2150;font-size:15px;line-height:1.6;margin:0 0 24px;">Someone requested a password reset for your Talkativ account. Click the button below to set a new password.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#7035f5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;text-align:center;">Reset Password</a>
          <p style="color:#9e92ba;font-size:13px;margin:24px 0 0;">This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        </div>
      </div>
    `,
  });
};

export const sendOrderConfirmation = async (to: string, order: { id: string; items: string; amount: string }) => {
  return resend.emails.send({
    from,
    to: [to],
    subject: `Order Confirmed — #${order.id.slice(0, 8)}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:#f2ebfa;padding:32px 36px;border-bottom:1px solid #e1d6f5;">
          <h1 style="color:#2d2150;margin:0;font-size:20px;font-weight:700;">Order Confirmed</h1>
          <p style="color:#574c76;font-size:14px;margin:4px 0 0;">Thank you for your order!</p>
        </div>
        <div style="padding:32px 36px;">
          <div style="background:#f8f6ff;border:1.5px solid #ece5ff;border-radius:12px;padding:20px 24px;">
            <div style="margin-bottom:12px;display:flex;justify-content:space-between;">
              <span style="font-size:14px;color:#6b5e8a;">Order ID</span>
              <strong style="font-size:14px;color:#130d2e;">#${order.id.slice(0, 8)}</strong>
            </div>
            <div style="margin-bottom:12px;display:flex;justify-content:space-between;border-top:1px solid #ece5ff;padding-top:12px;">
              <span style="font-size:14px;color:#6b5e8a;">Items</span>
              <span style="font-size:14px;color:#130d2e;text-align:right;max-width:200px;">${order.items}</span>
            </div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid #ece5ff;padding-top:12px;">
              <strong style="font-size:15px;color:#130d2e;">Total</strong>
              <strong style="font-size:15px;color:#7035f5;">£${order.amount}</strong>
            </div>
          </div>
        </div>
      </div>
    `,
  });
};

export const sendMissedCallAlert = async (to: string, callerPhone: string) => {
  return resend.emails.send({
    from,
    to: [to],
    subject: 'Missed Call Alert — Talkativ',
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:#fef2f2;padding:32px 36px;border-bottom:1px solid #fecaca;">
          <h1 style="color:#991b1b;margin:0;font-size:20px;font-weight:700;">Missed Call Alert</h1>
        </div>
        <div style="padding:32px 36px;">
          <p style="color:#2d2150;font-size:15px;line-height:1.6;margin:0 0 24px;">You just missed a call from <strong>${callerPhone}</strong>.</p>
          <p style="color:#6b5e8a;font-size:14px;margin:0;">Log in to your Talkativ dashboard to view call details or listen to voicemails.</p>
        </div>
      </div>
    `,
  });
};

export const sendPaymentReceipt = async (to: string, amount: string, date: string) => {
  return resend.emails.send({
    from,
    to: [to],
    subject: 'Payment Receipt — Talkativ',
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:#f0fdf4;padding:32px 36px;border-bottom:1px solid #bbf7d0;">
          <h1 style="color:#166534;margin:0;font-size:20px;font-weight:700;">Payment Receipt</h1>
          <p style="color:#15803d;font-size:14px;margin:4px 0 0;">Thank you for your payment!</p>
        </div>
        <div style="padding:32px 36px;">
          <div style="background:#f8f6ff;border:1.5px solid #ece5ff;border-radius:12px;padding:20px 24px;">
            <div style="margin-bottom:12px;display:flex;justify-content:space-between;">
              <span style="font-size:14px;color:#6b5e8a;">Amount</span>
              <strong style="font-size:15px;color:#130d2e;">£${amount}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid #ece5ff;padding-top:12px;">
              <span style="font-size:14px;color:#6b5e8a;">Date</span>
              <span style="font-size:14px;color:#130d2e;">${date}</span>
            </div>
          </div>
        </div>
      </div>
    `,
  });
};

export const sendTrialEndingEmail = async (to: string, daysLeft: number) => {
  return resend.emails.send({
    from,
    to: [to],
    subject: `Your trial ends in ${daysLeft} days — Talkativ`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:#fffbeb;padding:32px 36px;border-bottom:1px solid #fde68a;">
          <h1 style="color:#92400e;margin:0;font-size:20px;font-weight:700;">Trial Ending Soon</h1>
        </div>
        <div style="padding:32px 36px;">
          <p style="color:#2d2150;font-size:15px;line-height:1.6;margin:0 0 24px;">Your Talkativ trial will expire in <strong>${daysLeft} days</strong>.</p>
          <p style="color:#6b5e8a;font-size:14px;margin:0;">To keep your AI agent running and answering calls without interruption, please upgrade your plan in your dashboard.</p>
        </div>
      </div>
    `,
  });
};

export const sendPasswordChangeAlert = async (to: string, firstName: string, recoveryUrl: string) => {
  return resend.emails.send({
    from,
    to: [to],
    subject: 'Your password was changed — Talkativ',
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:#f8f6ff;padding:32px 36px;border-bottom:1px solid #ece5ff;">
          <h1 style="color:#130d2e;margin:0;font-size:20px;font-weight:700;">Password Changed</h1>
        </div>
        <div style="padding:32px 36px;">
          <p style="color:#2d2150;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${firstName}, the password for your Talkativ account was just changed.</p>
          <p style="color:#2d2150;font-size:15px;line-height:1.6;margin:0 0 24px;">If this was you, no further action is needed.</p>
          <div style="background:#fef2f2;border-radius:12px;padding:20px;margin-bottom:24px;">
            <p style="color:#991b1b;font-size:14px;margin:0 0 16px;font-weight:600;">Didn't make this change?</p>
            <p style="color:#7f1d1d;font-size:14px;margin:0 0 16px;">Reset your password immediately to secure your account.</p>
            <a href="${recoveryUrl}" style="display:inline-block;background:#ef4444;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">Secure My Account</a>
          </div>
          <p style="color:#9e92ba;font-size:12px;margin:0;">This recovery link expires in 1 hour.</p>
        </div>
      </div>
    `,
  });
};

export const sendOtpEmail = async (to: string, firstName: string, code: string) => {
  return resend.emails.send({
    from,
    to: [to],
    subject: `Your Talkativ verification code: ${code}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:#f8f6ff;padding:32px 36px;border-bottom:1px solid #ece5ff;">
          <h1 style="color:#130d2e;margin:0;font-size:20px;font-weight:700;">Verification Code</h1>
        </div>
        <div style="padding:32px 36px;">
          <p style="color:#2d2150;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi ${firstName}, here is your 6-digit verification code:</p>
          <div style="background:#f5f2ff;border:1px dashed #bba8ff;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
            <div style="font-size:40px;font-weight:900;letter-spacing:12px;color:#7035f5;font-family:monospace;">${code}</div>
          </div>
          <p style="color:#6b5e8a;font-size:13px;margin:0 0 8px;">This code expires in 10 minutes.</p>
          <p style="color:#9e92ba;font-size:13px;margin:0;">If you did not request this code, please ignore this email.</p>
        </div>
      </div>
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
      <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:#fffbeb;padding:32px 36px;border-bottom:1px solid #fde68a;">
          <h1 style="color:#92400e;margin:0;font-size:20px;font-weight:700;">Refund Request</h1>
          <p style="color:#b45309;font-size:14px;margin:4px 0 0;">A guest requested a reservation refund.</p>
        </div>
        <div style="padding:32px 36px;">
          <div style="background:#fefce8;border:1.5px solid #fef08a;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:14px;color:#854d0e;">Guest</span>
              <strong style="font-size:14px;color:#422006;">${guestName}</strong>
            </div>
            <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #fef08a;padding-top:12px;">
              <span style="font-size:14px;color:#854d0e;">Reservation ID</span>
              <span style="font-size:14px;color:#422006;">#${reservationId.slice(0, 8)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #fef08a;padding-top:12px;">
              <strong style="font-size:15px;color:#422006;">Refund Amount</strong>
              <strong style="font-size:15px;color:#ef4444;">£${amount}</strong>
            </div>
          </div>
          <p style="color:#6b5e8a;font-size:14px;margin:0;">Log in to your Talkativ dashboard to review and process this refund.</p>
        </div>
      </div>
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

export const sendSupportTicket = async (params: {
  category: string;
  subject: string;
  message: string;
  fromEmail: string;
  fromPhone: string;
  businessName: string;
  merchantId?: string;
}) => {
  return resend.emails.send({
    from,
    to: [env.SUPPORT_EMAIL],
    subject: `[Support Ticket – ${params.category}] ${params.subject}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#7035f5,#4b1ab5);padding:28px 32px;">
          <h1 style="color:white;margin:0;font-size:20px;font-weight:800;">New Support Ticket</h1>
          <p style="color:rgba(255,255,255,.75);margin:6px 0 0;font-size:13px;">Category: <strong style="color:white;">${params.category}</strong></p>
        </div>
        <div style="padding:28px 32px;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tr><td style="padding:8px 0;font-size:13px;color:#6b5e8a;width:130px;">Business</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#130d2e;">${params.businessName}</td></tr>
            ${params.merchantId ? `<tr style="border-top:1px solid #f0ebff;"><td style="padding:8px 0;font-size:13px;color:#6b5e8a;">Merchant ID</td><td style="padding:8px 0;font-size:13px;font-family:monospace;color:#4b1ab5;">${params.merchantId}</td></tr>` : ''}
            <tr style="border-top:1px solid #f0ebff;"><td style="padding:8px 0;font-size:13px;color:#6b5e8a;">Email</td><td style="padding:8px 0;font-size:14px;color:#130d2e;"><a href="mailto:${params.fromEmail}" style="color:#7035f5;text-decoration:none;">${params.fromEmail}</a></td></tr>
            <tr style="border-top:1px solid #f0ebff;"><td style="padding:8px 0;font-size:13px;color:#6b5e8a;">Phone</td><td style="padding:8px 0;font-size:14px;color:#130d2e;">${params.fromPhone || '—'}</td></tr>
            <tr style="border-top:1px solid #f0ebff;"><td style="padding:8px 0;font-size:13px;color:#6b5e8a;">Subject</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#130d2e;">${params.subject}</td></tr>
          </table>
          <div style="background:#f8f6ff;border:1.5px solid #ece5ff;border-radius:12px;padding:20px 24px;">
            <div style="font-size:12px;font-weight:700;color:#9e92ba;letter-spacing:.5px;text-transform:uppercase;margin-bottom:10px;">Message</div>
            <p style="font-size:14px;color:#2d2150;line-height:1.7;margin:0;white-space:pre-wrap;">${params.message}</p>
          </div>
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

// ─── Incomplete Onboarding Reminder ──────────────────────────────────────────
export const sendIncompleteOnboardingReminder = async (to: string, firstName: string, resumeStep: number = 1) => {
  const stepUrl = `${env.FRONTEND_URL}/#/onboarding/${resumeStep}`;
  return resend.emails.send({
    from,
    to: [to],
    subject: `You're almost there, ${firstName}! Complete your Talkativ setup`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#7035f5,#4b1ab5);padding:32px;">
          <div style="font-family:'Georgia',serif;font-size:22px;font-weight:700;color:white;font-style:italic;">Talkativ</div>
        </div>
        <div style="padding:36px 32px;">
          <h1 style="font-size:22px;font-weight:800;color:#130d2e;margin:0 0 12px;">Hi ${firstName}, you're almost done! 👋</h1>
          <p style="font-size:15px;color:#6b5e8a;line-height:1.7;margin:0 0 28px;">
            You started setting up your AI phone agent but didn't quite finish. No worries — your progress is saved and you can pick up right where you left off.
          </p>
          <a href="${stepUrl}" style="display:inline-block;background:linear-gradient(135deg,#7035f5,#4b1ab5);color:white;text-decoration:none;padding:15px 36px;border-radius:50px;font-size:15px;font-weight:700;box-shadow:0 6px 24px rgba(112,53,245,.35);">
            Complete my setup →
          </a>
          <p style="font-size:13px;color:#9e92ba;margin:28px 0 0;line-height:1.6;">
            Once set up, your AI agent will answer every customer call — taking orders, booking reservations, and answering questions 24/7.
          </p>
        </div>
        <div style="background:#f8f6ff;padding:20px 32px;border-top:1px solid #ebe6f5;">
          <p style="font-size:12px;color:#9e92ba;margin:0;">Questions? Reply to this email or visit <a href="https://talkativ.io" style="color:#7035f5;">talkativ.io</a></p>
        </div>
      </div>
    `,
  });
};

// ─── Onboarding Complete / Welcome to Dashboard ───────────────────────────────
export const sendOnboardingCompleteEmail = async (
  to: string,
  firstName: string,
  agentName: string,
  businessName: string,
  plan: string = 'GROWTH',
) => {
  const dashUrl = `${env.FRONTEND_URL}/#/dashboard`;
  const isPro = plan === 'PRO' || plan === 'ENTERPRISE';

  const paymentSection = isPro
    ? `<div style="background:#fef3ff;border:1.5px solid #e9d5ff;border-radius:14px;padding:24px;margin-bottom:24px;">
            <div style="font-size:12px;font-weight:700;color:#6b21a8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">💳 Connect a payment method</div>
            <p style="font-size:14px;color:#581c87;line-height:1.6;margin:0 0 12px;">
              To accept "Pay Now" orders over the phone, connect one of the following in <strong>Dashboard → Integrations</strong>:
            </p>
            <div style="font-size:13.5px;color:#581c87;line-height:1.9;">
              🟦 <strong>Square</strong> — most popular in the UK, free to start<br/>
              🟠 <strong>SumUp</strong> — great for takeaways and small restaurants<br/>
              🍀 <strong>Clover</strong> — full POS with payment links<br/>
              💳 <strong>Zettle by PayPal</strong> — popular with independent restaurants<br/>
              💳 <strong>Stripe</strong> — connect your existing Stripe account directly<br/>
            </div>
            <p style="font-size:13px;color:#7e22ce;line-height:1.5;margin:12px 0 0;">
              Customers pay directly into your account — Talkativ never holds your money.
            </p>
          </div>`
    : `<div style="background:#fef3ff;border:1.5px solid #e9d5ff;border-radius:14px;padding:24px;margin-bottom:24px;">
            <div style="font-size:12px;font-weight:700;color:#6b21a8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">💳 Connect a payment method</div>
            <p style="font-size:14px;color:#581c87;line-height:1.6;margin:0 0 12px;">
              Your Growth plan includes <strong>SumUp</strong> and <strong>Stripe Connect</strong> for phone payments. Connect them in <strong>Dashboard → Integrations</strong>:
            </p>
            <div style="font-size:13.5px;color:#581c87;line-height:1.9;">
              🟠 <strong>SumUp</strong> — great for takeaways and small restaurants<br/>
              💳 <strong>Stripe</strong> — connect your existing Stripe account directly<br/>
            </div>
            <p style="font-size:13px;color:#7e22ce;line-height:1.5;margin:12px 0 0;">
              Need Square, Clover, or Zettle? Upgrade to the <strong>Pro plan</strong> in Dashboard → Billing.
            </p>
          </div>`;

  return resend.emails.send({
    from,
    to: [to],
    subject: `🎉 Congratulations ${firstName}! Your AI agent ${agentName} is live`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#7035f5,#4b1ab5);padding:36px 32px;text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">🎉</div>
          <h1 style="font-size:24px;font-weight:800;color:white;margin:0 0 8px;">You're all set, ${firstName}!</h1>
          <p style="font-size:14px;color:rgba(255,255,255,.8);margin:0;">${agentName} is now live for ${businessName}</p>
        </div>
        <div style="padding:36px 32px;">
          <p style="font-size:15px;color:#6b5e8a;line-height:1.7;margin:0 0 28px;">
            Your AI phone agent <strong style="color:#130d2e;">${agentName}</strong> is ready to take calls for <strong style="color:#130d2e;">${businessName}</strong>.
          </p>
          <div style="background:#f8f6ff;border:1.5px solid #ece5ff;border-radius:14px;padding:24px;margin-bottom:24px;">
            <div style="font-size:12px;font-weight:700;color:#7035f5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;">What ${agentName} can do right now</div>
            <div style="font-size:14px;color:#2d2150;line-height:1.8;">
              📞 Answer every inbound call instantly, 24/7<br/>
              📋 Read out your full menu and prices<br/>
              🕐 Tell customers your opening hours<br/>
              ❓ Answer FAQs from your dashboard<br/>
              🛒 Take orders and book reservations<br/>
              👤 Transfer calls to you or a manager on request
            </div>
          </div>
          <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:14px;padding:24px;margin-bottom:24px;">
            <div style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">⚙️ Two more steps before you go live</div>
            <p style="font-size:14px;color:#78350f;line-height:1.6;margin:0 0 10px;">
              Before ${agentName} can take orders or book tables, do these in the dashboard:
            </p>
            <div style="font-size:13.5px;color:#78350f;line-height:1.9;">
              📦 <strong>Settings → Ordering</strong> — enable delivery/collection, fees, payment methods<br/>
              📅 <strong>Settings → Reservations</strong> — party size, lead time, deposit rules
            </div>
          </div>
          ${paymentSection}
          <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:14px;padding:20px 24px;margin-bottom:28px;">
            <div style="font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">🚀 Dashboard walkthrough</div>
            <div style="font-size:13.5px;color:#15803d;line-height:1.9;">
              <strong>My Agent</strong> — Live call stats and agent status<br/>
              <strong>Menu</strong> — Add/edit items, syncs to agent instantly<br/>
              <strong>FAQs</strong> — Agent answers these automatically<br/>
              <strong>Voice &amp; Script</strong> — Change voice, name and greeting<br/>
              <strong>Settings</strong> — Ordering, reservations, business info
            </div>
          </div>
          <div style="text-align:center;">
            <a href="${dashUrl}" style="display:inline-block;background:linear-gradient(135deg,#7035f5,#4b1ab5);color:white;text-decoration:none;padding:15px 40px;border-radius:50px;font-size:15px;font-weight:700;box-shadow:0 6px 24px rgba(112,53,245,.35);">
              Go to my dashboard →
            </a>
          </div>
        </div>
        <div style="background:#f8f6ff;padding:20px 32px;border-top:1px solid #ebe6f5;">
          <p style="font-size:12px;color:#9e92ba;margin:0;">Need help? <a href="mailto:support@talkativ.io" style="color:#7035f5;">support@talkativ.io</a> — we reply within a few hours.</p>
        </div>
      </div>
    `,
  });
};

// ─── Account Suspended ────────────────────────────────────────────────────────
export const sendAccountSuspendedEmail = async (to: string, businessName: string) => {
  return resend.emails.send({
    from,
    to: [to],
    subject: 'Important notice regarding your Talkativ account',
    html: `
      <div style="font-family:'Outfit',sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ebe6f5;">
        <div style="background:linear-gradient(135deg,#1a0a2e,#2d1060);padding:32px 36px;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Talkativ</div>
        </div>
        <div style="padding:32px 36px;">
          <h2 style="color:#1a0a2e;font-size:20px;font-weight:700;margin:0 0 16px;">Account Under Review</h2>
          <p style="color:#2d2150;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${businessName},</p>
          <p style="color:#2d2150;font-size:15px;line-height:1.6;margin:0 0 16px;">Your Talkativ account has been flagged for suspicious activity and is currently under review by our team. Access to your account and AI agent has been temporarily suspended while we investigate.</p>
          <div style="background:#fff5f5;border:1.5px solid #fecaca;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
            <p style="color:#dc2626;font-size:14px;font-weight:600;margin:0;">Your AI agent has been paused and will not accept calls during this review period.</p>
          </div>
          <p style="color:#6b5e8a;font-size:14px;line-height:1.6;margin:0 0 16px;">If you believe this is a mistake or would like to appeal this decision, please contact our support team immediately at <a href="mailto:support@talkativ.io" style="color:#7035f5;">support@talkativ.io</a> with your account details.</p>
          <p style="color:#9e92ba;font-size:13px;margin:0;">We aim to resolve reviews within 24–48 hours.</p>
        </div>
        <div style="background:#f8f6ff;padding:20px 32px;border-top:1px solid #ebe6f5;">
          <p style="font-size:12px;color:#9e92ba;margin:0;">Talkativ Trust & Safety · <a href="mailto:support@talkativ.io" style="color:#7035f5;">support@talkativ.io</a></p>
        </div>
      </div>
    `,
  });
};

// ─── Order Payment Confirmation (to customer) ────────────────────────────────
export const sendOrderPaymentConfirmation = async (
  to: string,
  customerName: string,
  businessName: string,
  orderId: string,
  items: string,
  total: number,
) => {
  return resend.emails.send({
    from,
    to: [to],
    subject: `Payment confirmed — Order #${orderId.slice(0, 8)} at ${businessName}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:#f0fdf4;padding:32px 36px;border-bottom:1px solid #bbf7d0;">
          <h1 style="color:#166534;margin:0;font-size:20px;font-weight:700;">Payment Confirmed ✓</h1>
          <p style="color:#15803d;font-size:14px;margin:6px 0 0;">Thank you, ${customerName}! Your order is now being prepared.</p>
        </div>
        <div style="padding:32px 36px;">
          <div style="background:#f8f6ff;border:1.5px solid #ece5ff;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
            <div style="margin-bottom:10px;display:flex;justify-content:space-between;">
              <span style="font-size:13px;color:#6b5e8a;">Order ID</span>
              <strong style="font-size:13px;color:#130d2e;">#${orderId.slice(0, 8)}</strong>
            </div>
            <div style="margin-bottom:10px;display:flex;justify-content:space-between;border-top:1px solid #ece5ff;padding-top:10px;">
              <span style="font-size:13px;color:#6b5e8a;">Restaurant</span>
              <span style="font-size:13px;color:#130d2e;">${businessName}</span>
            </div>
            <div style="margin-bottom:10px;display:flex;justify-content:space-between;border-top:1px solid #ece5ff;padding-top:10px;">
              <span style="font-size:13px;color:#6b5e8a;">Items</span>
              <span style="font-size:13px;color:#130d2e;text-align:right;max-width:240px;">${items}</span>
            </div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid #ece5ff;padding-top:10px;">
              <strong style="font-size:15px;color:#130d2e;">Total Paid</strong>
              <strong style="font-size:15px;color:#7035f5;">£${total.toFixed(2)}</strong>
            </div>
          </div>
          <p style="color:#9e92ba;font-size:13px;margin:0;line-height:1.6;">Keep this email as your receipt. Contact ${businessName} directly if you have any questions about your order.</p>
        </div>
      </div>
    `,
  });
};

// ─── Business: Order Payment Received ────────────────────────────────────────
export const sendBusinessOrderPaymentReceived = async (
  to: string,
  businessName: string,
  orderId: string,
  customerName: string,
  customerPhone: string | null,
  items: string,
  total: number,
) => {
  return resend.emails.send({
    from,
    to: [to],
    subject: `💳 Order Payment Received — #${orderId.slice(0, 8)}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:12px;overflow:hidden;">
        <div style="background:#f0fdf4;padding:24px;border-bottom:1px solid #bbf7d0;">
          <h1 style="color:#166534;margin:0;font-size:20px;">Payment Received</h1>
          <p style="color:#15803d;font-size:14px;margin:4px 0 0;">Order #${orderId.slice(0, 8)} for ${businessName} has been paid.</p>
        </div>
        <div style="padding:24px;">
          <p style="margin:4px 0;font-size:14px;"><strong>Customer:</strong> ${customerName}</p>
          ${customerPhone ? `<p style="margin:4px 0;font-size:14px;"><strong>Phone:</strong> ${customerPhone}</p>` : ''}
          <p style="margin:12px 0 4px;font-size:14px;"><strong>Items:</strong> ${items}</p>
          <p style="margin:4px 0;font-size:15px;"><strong>Amount Paid: £${total.toFixed(2)}</strong></p>
          <p style="margin:16px 0 0;font-size:13px;color:#6b5e8a;">This order is now confirmed and payment has been collected. Please prepare it accordingly.</p>
        </div>
      </div>
    `,
  });
};

// ─── Reservation Deposit Confirmation (to guest) ─────────────────────────────
export const sendReservationDepositConfirmation = async (
  to: string,
  guestName: string,
  businessName: string,
  dateTime: Date,
  guests: number,
  depositAmount: number,
  reservationId: string,
) => {
  const formattedDate = dateTime.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return resend.emails.send({
    from,
    to: [to],
    subject: `Reservation confirmed — ${businessName} on ${dateTime.toLocaleDateString('en-GB')}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:#f0fdf4;padding:32px 36px;border-bottom:1px solid #bbf7d0;">
          <h1 style="color:#166534;margin:0;font-size:20px;font-weight:700;">Reservation Confirmed ✓</h1>
          <p style="color:#15803d;font-size:14px;margin:6px 0 0;">Your deposit has been received, ${guestName}. We look forward to seeing you!</p>
        </div>
        <div style="padding:32px 36px;">
          <div style="background:#f8f6ff;border:1.5px solid #ece5ff;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
            <div style="margin-bottom:10px;display:flex;justify-content:space-between;">
              <span style="font-size:13px;color:#6b5e8a;">Booking Ref</span>
              <strong style="font-size:13px;color:#130d2e;">#${reservationId.slice(0, 8)}</strong>
            </div>
            <div style="margin-bottom:10px;display:flex;justify-content:space-between;border-top:1px solid #ece5ff;padding-top:10px;">
              <span style="font-size:13px;color:#6b5e8a;">Restaurant</span>
              <span style="font-size:13px;color:#130d2e;">${businessName}</span>
            </div>
            <div style="margin-bottom:10px;display:flex;justify-content:space-between;border-top:1px solid #ece5ff;padding-top:10px;">
              <span style="font-size:13px;color:#6b5e8a;">Date & Time</span>
              <span style="font-size:13px;color:#130d2e;text-align:right;">${formattedDate}</span>
            </div>
            <div style="margin-bottom:10px;display:flex;justify-content:space-between;border-top:1px solid #ece5ff;padding-top:10px;">
              <span style="font-size:13px;color:#6b5e8a;">Party Size</span>
              <span style="font-size:13px;color:#130d2e;">${guests} guest${guests > 1 ? 's' : ''}</span>
            </div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid #ece5ff;padding-top:10px;">
              <strong style="font-size:14px;color:#130d2e;">Deposit Paid</strong>
              <strong style="font-size:14px;color:#22c55e;">£${depositAmount.toFixed(2)} ✓</strong>
            </div>
          </div>
          <p style="color:#9e92ba;font-size:13px;margin:0;line-height:1.6;">To modify or cancel your reservation, please contact ${businessName} directly or call us.</p>
        </div>
      </div>
    `,
  });
};

// ─── Business: Reservation Deposit Received ──────────────────────────────────
export const sendBusinessDepositReceived = async (
  to: string,
  businessName: string,
  reservationId: string,
  guestName: string,
  guestPhone: string | null,
  guests: number,
  dateTime: Date,
  depositAmount: number,
) => {
  const formattedDate = dateTime.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return resend.emails.send({
    from,
    to: [to],
    subject: `💳 Deposit Received — ${guestName} (${formattedDate})`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:12px;overflow:hidden;">
        <div style="background:#f0fdf4;padding:24px;border-bottom:1px solid #bbf7d0;">
          <h1 style="color:#166534;margin:0;font-size:20px;">Reservation Deposit Received</h1>
          <p style="color:#15803d;font-size:14px;margin:4px 0 0;">Booking #${reservationId.slice(0, 8)} deposit has been paid for ${businessName}.</p>
        </div>
        <div style="padding:24px;">
          <p style="margin:4px 0;font-size:14px;"><strong>Guest:</strong> ${guestName}</p>
          ${guestPhone ? `<p style="margin:4px 0;font-size:14px;"><strong>Phone:</strong> ${guestPhone}</p>` : ''}
          <p style="margin:4px 0;font-size:14px;"><strong>Date & Time:</strong> ${formattedDate}</p>
          <p style="margin:4px 0;font-size:14px;"><strong>Party Size:</strong> ${guests} guest${guests > 1 ? 's' : ''}</p>
          <p style="margin:12px 0 4px;font-size:15px;"><strong>Deposit Paid: £${depositAmount.toFixed(2)}</strong></p>
          <p style="margin:16px 0 0;font-size:13px;color:#6b5e8a;">The reservation is now confirmed. It has been sent to your reservation system.</p>
        </div>
      </div>
    `,
  });
};

// ─── Reservation Cancellation (to guest) ─────────────────────────────────────
export const sendReservationCancellationToGuest = async (
  to: string,
  guestName: string,
  businessName: string,
  dateTime: Date,
  reservationId: string,
) => {
  const formattedDate = dateTime.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return resend.emails.send({
    from,
    to: [to],
    subject: `Reservation cancelled — ${businessName} on ${dateTime.toLocaleDateString('en-GB')}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:16px;overflow:hidden;">
        <div style="background:#fef2f2;padding:32px 36px;border-bottom:1px solid #fecaca;">
          <h1 style="color:#991b1b;margin:0;font-size:20px;font-weight:700;">Reservation Cancelled</h1>
          <p style="color:#b91c1c;font-size:14px;margin:6px 0 0;">Your reservation at ${businessName} has been cancelled.</p>
        </div>
        <div style="padding:32px 36px;">
          <div style="background:#f8f6ff;border:1.5px solid #ece5ff;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
            <div style="margin-bottom:10px;display:flex;justify-content:space-between;">
              <span style="font-size:13px;color:#6b5e8a;">Booking Ref</span>
              <strong style="font-size:13px;color:#130d2e;">#${reservationId.slice(0, 8)}</strong>
            </div>
            <div style="margin-bottom:10px;display:flex;justify-content:space-between;border-top:1px solid #ece5ff;padding-top:10px;">
              <span style="font-size:13px;color:#6b5e8a;">Restaurant</span>
              <span style="font-size:13px;color:#130d2e;">${businessName}</span>
            </div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid #ece5ff;padding-top:10px;">
              <span style="font-size:13px;color:#6b5e8a;">Original Date</span>
              <span style="font-size:13px;color:#130d2e;text-align:right;">${formattedDate}</span>
            </div>
          </div>
          <p style="color:#9e92ba;font-size:13px;margin:0;line-height:1.6;">If a deposit was paid and you believe you are entitled to a refund, please contact ${businessName} directly.</p>
        </div>
      </div>
    `,
  });
};

// ─── Business: Reservation Cancelled ─────────────────────────────────────────
export const sendBusinessReservationCancelled = async (
  to: string,
  businessName: string,
  reservationId: string,
  guestName: string,
  guestPhone: string | null,
  dateTime: Date,
) => {
  const formattedDate = dateTime.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return resend.emails.send({
    from,
    to: [to],
    subject: `❌ Reservation Cancelled — ${guestName} (${dateTime.toLocaleDateString('en-GB')})`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #ebe6f5;border-radius:12px;overflow:hidden;">
        <div style="background:#fef2f2;padding:24px;border-bottom:1px solid #fecaca;">
          <h1 style="color:#991b1b;margin:0;font-size:20px;">Reservation Cancelled</h1>
          <p style="color:#b91c1c;font-size:14px;margin:4px 0 0;">Booking #${reservationId.slice(0, 8)} for ${businessName} has been cancelled by the guest.</p>
        </div>
        <div style="padding:24px;">
          <p style="margin:4px 0;font-size:14px;"><strong>Guest:</strong> ${guestName}</p>
          ${guestPhone ? `<p style="margin:4px 0;font-size:14px;"><strong>Phone:</strong> ${guestPhone}</p>` : ''}
          <p style="margin:4px 0;font-size:14px;"><strong>Original Date:</strong> ${formattedDate}</p>
          <p style="margin:16px 0 0;font-size:13px;color:#6b5e8a;">Review your dashboard to check deposit status and decide on any applicable refund.</p>
        </div>
      </div>
    `,
  });
};

// ─── Account Reinstated ───────────────────────────────────────────────────────
export const sendAccountReinstatedEmail = async (to: string, businessName: string) => {
  return resend.emails.send({
    from,
    to: [to],
    subject: 'Your Talkativ account has been reinstated',
    html: `
      <div style="font-family:'Outfit',sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ebe6f5;">
        <div style="background:linear-gradient(135deg,#1a0a2e,#2d1060);padding:32px 36px;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Talkativ</div>
        </div>
        <div style="padding:32px 36px;">
          <h2 style="color:#1a0a2e;font-size:20px;font-weight:700;margin:0 0 16px;">Account Reinstated</h2>
          <p style="color:#2d2150;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${businessName},</p>
          <p style="color:#2d2150;font-size:15px;line-height:1.6;margin:0 0 16px;">Great news — our review of your account is complete and we have confirmed that everything is in order. Your Talkativ account has been fully reinstated.</p>
          <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
            <p style="color:#16a34a;font-size:14px;font-weight:600;margin:0;">Your AI agent is live again and ready to take calls.</p>
          </div>
          <p style="color:#6b5e8a;font-size:14px;line-height:1.6;margin:0;">We apologise for any inconvenience caused. If you have any questions, please reach out at <a href="mailto:support@talkativ.io" style="color:#7035f5;">support@talkativ.io</a>.</p>
        </div>
        <div style="background:#f8f6ff;padding:20px 32px;border-top:1px solid #ebe6f5;">
          <p style="font-size:12px;color:#9e92ba;margin:0;">Talkativ Trust & Safety · <a href="mailto:support@talkativ.io" style="color:#7035f5;">support@talkativ.io</a></p>
        </div>
      </div>
    `,
  });
};

