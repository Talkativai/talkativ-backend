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
