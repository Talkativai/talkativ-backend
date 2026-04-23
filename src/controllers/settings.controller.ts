import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import * as authService from '../services/auth.service.js';
import * as emailService from '../services/email.service.js';
import * as elevenlabs from '../services/elevenlabs.service.js';
import * as twilioService from '../services/twilio.service.js';
import { autoSyncAgent } from './agent.controller.js';
import crypto from 'crypto';

// ─── Business Settings ───────────────────────────────────────────────────────
export const getBusinessSettings = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { orderingPolicy: true, reservationPolicy: true },
  });
  if (!business) throw ApiError.notFound('Business not found');
  res.json(business);
});

export const updateBusinessSettings = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const updated = await prisma.business.update({ where: { id: businessId }, data: req.body });
  autoSyncAgent(businessId).catch(err => console.error('[AutoSync] failed:', err.message));
  res.json(updated);
});

// ─── Notification Settings ───────────────────────────────────────────────────
export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const settings = await prisma.notificationSettings.findUnique({ where: { businessId } });
  res.json(settings || { emailNewOrder: true, emailMissedCall: true, emailDailySummary: true, pushLiveCall: true, pushNewOrder: true });
});

export const updateNotifications = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const settings = await prisma.notificationSettings.upsert({
    where: { businessId },
    update: req.body,
    create: { businessId, ...req.body },
  });
  res.json(settings);
});

// ─── Phone Config ────────────────────────────────────────────────────────────
export const getPhoneConfig = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const config = await prisma.phoneConfig.findUnique({ where: { businessId } });
  res.json(config || { assignedNumber: null, forwardNumber: null, ringsBeforeAi: 0 });
});

export const updatePhoneConfig = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const config = await prisma.phoneConfig.upsert({
    where: { businessId },
    update: req.body,
    create: { businessId, ...req.body },
  });
  res.json(config);
});

// ─── Reconnect Phone ─────────────────────────────────────────────────────────
// Re-registers the business's Twilio number with ElevenLabs and re-sets the
// Twilio voice webhook. Fixes "application error" on existing numbers.
export const reconnectPhone = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');

  const [phoneConfig, agent] = await Promise.all([
    prisma.phoneConfig.findUnique({ where: { businessId } }),
    prisma.agent.findUnique({ where: { businessId } }),
  ]);

  if (!phoneConfig?.assignedNumber) throw ApiError.badRequest('No phone number assigned to this account');
  if (!agent?.elevenlabsAgentId) throw ApiError.badRequest('No ElevenLabs agent found — complete onboarding first');

  const phoneNumberId = await elevenlabs.registerPhoneNumber(phoneConfig.assignedNumber, agent.elevenlabsAgentId);
  await twilioService.connectNumberToAgent(phoneConfig.assignedNumber, agent.elevenlabsAgentId);

  res.json({
    success: true,
    phoneNumber: phoneConfig.assignedNumber,
    agentId: agent.elevenlabsAgentId,
    elevenLabsPhoneId: phoneNumberId,
  });
});

// ─── Password ────────────────────────────────────────────────────────────────
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) throw ApiError.notFound('User not found');

  const valid = await authService.comparePassword(req.body.currentPassword, user.passwordHash ?? '');
  if (!valid) throw ApiError.unauthorized('Current password is incorrect');

  const newHash = await authService.hashPassword(req.body.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

  // Revoke all refresh tokens (force re-login)
  await authService.revokeAllUserTokens(user.id);

  // Send security alert email with recovery link
  const resetToken = crypto.randomBytes(32).toString('hex');
  const recoveryUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
  emailService.sendPasswordChangeAlert(user.email, user.firstName, recoveryUrl).catch(err => console.error('[Email] sendPasswordChangeAlert failed:', err));

  res.json({ message: 'Password changed. All sessions have been revoked.' });
});

// ─── Sessions ────────────────────────────────────────────────────────────────
export const getSessions = asyncHandler(async (req: Request, res: Response) => {
  const sessions = await prisma.session.findMany({
    where: { userId: req.user!.userId },
    orderBy: { lastActive: 'desc' },
  });
  // Tag owner sessions
  const tagged = sessions.map(s => ({ ...s, ownerType: 'owner' }));
  res.json(tagged);
});

export const revokeSession = asyncHandler(async (req: Request, res: Response) => {
  const session = await prisma.session.findFirst({ where: { id: req.params.id, userId: req.user!.userId } });
  if (!session) throw ApiError.notFound('Session not found');
  await prisma.session.delete({ where: { id: session.id } });
  res.json({ message: 'Session revoked' });
});

// ─── Ordering Policy ─────────────────────────────────────────────────────────
export const getOrderingPolicy = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const policy = await prisma.orderingPolicy.findUnique({ where: { businessId } });
  res.json(policy || { deliveryEnabled: false, collectionEnabled: false, deliveryRadius: 5, deliveryRadiusUnit: 'miles', minOrderAmount: 0, payNowEnabled: true, payOnDelivery: true, collectionPayNow: false, collectionPayOnPickup: false, deliveryPayNow: false, deliveryPayOnDelivery: false, deliveryFee: 0 });
});

export const updateOrderingPolicy = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const policy = await prisma.orderingPolicy.upsert({
    where: { businessId },
    update: req.body,
    create: { businessId, ...req.body },
  });
  autoSyncAgent(businessId).catch(err => console.error('[AutoSync] failed:', err.message));
  res.json(policy);
});

// ─── Reservation Policy ──────────────────────────────────────────────────────
export const getReservationPolicy = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const policy = await prisma.reservationPolicy.findUnique({ where: { businessId } });
  res.json(policy || { reservationsEnabled: false, depositRequired: false, depositAmount: 0, depositType: 'PER_GUEST', maxPartySize: 20, seatingCapacity: 50, bookingLeadTime: 24, cancellationHours: 24 });
});

export const updateReservationPolicy = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const policy = await prisma.reservationPolicy.upsert({
    where: { businessId },
    update: req.body,
    create: { businessId, ...req.body },
  });
  autoSyncAgent(businessId).catch(err => console.error('[AutoSync] failed:', err.message));
  res.json(policy);
});

// ─── Staff Management ────────────────────────────────────────────────────────
export const getStaff = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const staff = await prisma.staff.findMany({
    where: { businessId },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(staff);
});

export const createStaff = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const { firstName, lastName, email, role } = req.body;

  // Auto-generate unique username: firstname.lastname + 4 random digits
  const base = `${firstName.toLowerCase().replace(/[^a-z0-9]/g, '')}.${lastName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  let username = '';
  let attempts = 0;
  while (attempts < 10) {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const candidate = `${base}${suffix}`;
    const exists = await prisma.staff.findUnique({ where: { businessId_username: { businessId, username: candidate } } });
    if (!exists) { username = candidate; break; }
    attempts++;
  }
  if (!username) throw ApiError.conflict('Could not generate a unique username');

  // Auto-generate 12-char password
  const password = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, 'x').slice(0, 12);
  const passwordHash = await authService.hashPassword(password);

  const staff = await prisma.staff.create({
    data: { businessId, username, passwordHash, firstName, lastName, email: email || null, role: role || 'STAFF' },
    select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true, createdAt: true },
  });

  // Send credentials to staff email if provided
  let emailSent = false;
  if (email) {
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
    try {
      console.log('[Staff email] Attempting to send to:', email);
      const result = await emailService.sendStaffCredentials(
        email, firstName, business?.name || 'your business', username, password
      );
      console.log('[Staff email] sent ok:', JSON.stringify(result));
      emailSent = true;
    } catch (err: any) {
      console.error('[Staff email] FAILED:', err.message || err);
    }
  }

  // Return plain password once + accurate emailSent flag
  res.status(201).json({ ...staff, plainPassword: password, emailSent });
});

export const updateStaff = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const { id } = req.params;

  const staff = await prisma.staff.findFirst({ where: { id, businessId } });
  if (!staff) throw ApiError.notFound('Staff member not found');

  const updateData: any = {};
  if (req.body.username) updateData.username = req.body.username;
  if (req.body.firstName) updateData.firstName = req.body.firstName;
  if (req.body.lastName) updateData.lastName = req.body.lastName;
  if (req.body.role) updateData.role = req.body.role;
  if (req.body.password) {
    updateData.passwordHash = await authService.hashPassword(req.body.password);
  }

  const updated = await prisma.staff.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(updated);
});

export const deleteStaff = asyncHandler(async (req: Request, res: Response) => {
  const businessId = req.user!.businessId;
  if (!businessId) throw ApiError.notFound('Business not found');
  const { id } = req.params;

  const staff = await prisma.staff.findFirst({ where: { id, businessId } });
  if (!staff) throw ApiError.notFound('Staff member not found');

  await prisma.staff.delete({ where: { id } });
  res.json({ message: 'Staff member removed' });
});

// ─── OTP / 2FA ───────────────────────────────────────────────────────────────
export const sendOtp = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) throw ApiError.notFound('User not found');

  // Invalidate any existing unused OTPs
  await prisma.otpToken.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  // Generate 6-digit code
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.otpToken.create({ data: { userId: user.id, code, expiresAt } });

  await emailService.sendOtpEmail(user.email, user.firstName, code);

  res.json({ message: 'OTP sent to your email' });
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { code, enable } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) throw ApiError.notFound('User not found');

  const otp = await prisma.otpToken.findFirst({
    where: { userId: user.id, code, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) throw ApiError.unauthorized('Invalid or expired code');

  await prisma.otpToken.update({ where: { id: otp.id }, data: { used: true } });

  const twoFactorEnabled = enable !== false; // default: enable
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled } });

  res.json({ message: twoFactorEnabled ? '2FA enabled' : '2FA disabled', twoFactorEnabled });
});

// ─── Delete Account ───────────────────────────────────────────────────────────
export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const businessId = req.user!.businessId;

  // Find the business and its agent (if any)
  const business = businessId
    ? await prisma.business.findUnique({
        where: { id: businessId },
        include: { agent: { select: { id: true, elevenlabsAgentId: true } } },
      })
    : null;

  // Delete ElevenLabs agent before removing the DB record
  if (business?.agent?.elevenlabsAgentId) {
    try {
      await elevenlabs.deleteAgent(business.agent.elevenlabsAgentId);
    } catch (err) {
      console.error('Failed to delete ElevenLabs agent during account deletion:', err);
      // Non-fatal — proceed with DB deletion regardless
    }
  }

  // Deleting the user cascades to Business → Agent and all related records
  await prisma.user.delete({ where: { id: userId } });

  res.json({ message: 'Account deleted' });
});
