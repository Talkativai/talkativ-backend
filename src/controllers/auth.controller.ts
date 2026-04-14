import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';
import { env } from '../config/env.js';
import * as authService from '../services/auth.service.js';
import * as emailService from '../services/email.service.js';
import * as googleOAuth from '../services/google-oauth.service.js';
import jwt from 'jsonwebtoken';
// import { createClerkClient, verifyToken as verifyClerkToken } from '@clerk/backend'; // commented out — using Google OAuth
// const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY }); // commented out

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, firstName, lastName, googleId } = req.body;

  // Check if user exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  // Hash password & create user
  const passwordHash = await authService.hashPassword(password);

  // Build the data object — only include googleId if actually provided
  const userData: any = {
    email,
    passwordHash,
    firstName,
    lastName: lastName || '',
  };

  if (googleId) {
    userData.googleId = googleId;
    userData.emailVerified = true;
  }

  let user;
  try {
    user = await prisma.user.create({ data: userData });
  } catch (err: any) {
    if (err.code === 'P2002' && err.meta?.target?.includes('googleId')) {
      throw ApiError.conflict('This Google account is already linked to another user');
    }
    throw err;
  }

  // Create empty business shell (ignore errors — business may already exist)
  try {
    await prisma.business.create({
      data: {
        userId: user.id,
        name: '',
        type: '',
        address: '',
        phone: '',
        onboardingStep: 1,
      },
    });
  } catch (bizErr) {
    // Non-fatal: log but don't fail registration
    console.warn('Business shell creation failed (may already exist):', bizErr);
  }

  // Generate tokens
  const tokens = await authService.generateTokenPair(user);

  // Send welcome email (best effort)
  try {
    await emailService.sendWelcomeEmail(user.email, user.firstName);
  } catch (err) {
    console.error('[Email] Failed to send welcome email:', err);
  }

  // Set refresh token cookie
  res.cookie('refresh_token', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.status(201).json({
    accessToken: tokens.accessToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
    },
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw ApiError.unauthorized('Invalid email or password');

  const valid = await authService.comparePassword(password, user.passwordHash ?? '');
  if (!valid) throw ApiError.unauthorized('Invalid email or password');

  // Create session
  const device = req.headers['user-agent'] || 'Unknown';
  const ip = req.ip || 'Unknown';
  await authService.createSession(user.id, device, ip, 'Unknown');

  // Fetch onboarding status
  const business = await prisma.business.findUnique({
    where: { userId: user.id },
    select: { onboardingDone: true, onboardingStep: true },
  });

  // Send incomplete onboarding reminder if > 1 hour since registration
  if (business && !business.onboardingDone) {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (user.createdAt < hourAgo) {
      emailService.sendIncompleteOnboardingReminder(
        user.email,
        user.firstName || 'there',
        business.onboardingStep || 1,
      ).catch(() => {});
    }
  }

  // Generate tokens
  const tokens = await authService.generateTokenPair(user);

  res.cookie('refresh_token', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    accessToken: tokens.accessToken,
    onboardingDone: business?.onboardingDone ?? false,
    onboardingStep: business?.onboardingStep ?? 1,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
    },
  });
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refresh_token || req.body.refreshToken;
  if (!token) throw ApiError.unauthorized('No refresh token provided');

  const result = await authService.rotateRefreshToken(token);

  res.cookie('refresh_token', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ accessToken: result.accessToken, user: result.user });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refresh_token;
  if (token) {
    const stored = await prisma.refreshToken.findUnique({ where: { token } });
    if (stored) await prisma.refreshToken.delete({ where: { id: stored.id } });
  }

  res.clearCookie('refresh_token');
  res.json({ message: 'Logged out successfully' });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  // Always return success to prevent email enumeration
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const resetToken = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '1h' });
    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    try {
      await emailService.sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      console.error('[Email] Failed to send password reset email:', err);
    }
  }
  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) throw ApiError.badRequest('Token and new password are required');

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    const newHash = await authService.hashPassword(newPassword);

    await prisma.user.update({
      where: { id: decoded.userId },
      data: { passwordHash: newHash }
    });

    await authService.revokeAllUserTokens(decoded.userId);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    throw ApiError.badRequest('Invalid or expired reset token');
  }
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  // In production: verify email token, update emailVerified field
  res.json({ message: 'Email verified successfully' });
});

export const staffLogin = asyncHandler(async (req: Request, res: Response) => {
  const { username, password, businessName } = req.body;

  // Find the business by name (case-insensitive)
  const business = await prisma.business.findFirst({
    where: { name: { equals: businessName, mode: 'insensitive' } },
  });
  if (!business) throw ApiError.unauthorized('No business found with that name');

  // Find staff by username within that business
  const staff = await prisma.staff.findUnique({
    where: { businessId_username: { businessId: business.id, username } },
  });
  if (!staff) throw ApiError.unauthorized('No staff found with those credentials');

  // Verify password
  const valid = await authService.comparePassword(password, staff.passwordHash);
  if (!valid) throw ApiError.unauthorized('No staff found with those credentials');

  // Generate a JWT for the staff member
  const accessToken = authService.generateAccessToken({
    userId: staff.id,
    email: `${staff.username}@staff.${business.id}`,
    role: staff.role,
  });

  // Create session
  const device = req.headers['user-agent'] || 'Unknown';
  const ip = req.ip || 'Unknown';
  await authService.createSession(staff.id, device, ip, 'Unknown');

  res.json({
    accessToken,
    user: {
      id: staff.id,
      username: staff.username,
      firstName: staff.firstName,
      lastName: staff.lastName,
      role: staff.role,
      businessId: business.id,
      businessName: business.name,
    },
  });
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────

export const googleAuthRedirect = asyncHandler(async (req: Request, res: Response) => {
  const state = (req.query.state as string) || 'login';
  const url = googleOAuth.getAuthUrl(state);
  res.redirect(url);
});

export const googleAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.query as { code: string };
  if (!code) return res.redirect(`${env.FRONTEND_URL}/#/login?error=no_code`);

  try {
    const tokens = await googleOAuth.getTokens(code);
    if (!tokens.access_token) throw new Error('No access token from Google');

    const profile = await googleOAuth.getUserInfo(tokens.access_token);
    const user = await googleOAuth.findOrCreateUser({
      id: profile.id,
      email: profile.email,
      given_name: profile.given_name,
      family_name: profile.family_name,
    });

    if (user.status === 'SUSPENDED') {
      return res.redirect(`${env.FRONTEND_URL}/#/login?error=suspended`);
    }

    const jwtTokens = await authService.generateTokenPair(user);
    await authService.createSession(
      user.id,
      req.headers['user-agent'] || 'Unknown',
      req.ip || 'Unknown',
      'Unknown',
    );

    const business = await prisma.business.findUnique({
      where: { userId: user.id },
      select: { onboardingDone: true, onboardingStep: true },
    });

    res.cookie('refresh_token', jwtTokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Send welcome email for brand-new Google users (best effort)
    emailService.sendWelcomeEmail(user.email, user.firstName).catch(() => {});

    const dest = user.role === 'ADMIN' ? '/#/admin'
      : !business?.onboardingDone ? `/#/onboarding/${business?.onboardingStep || 1}`
      : '/#/dashboard';

    res.redirect(`${env.FRONTEND_URL}${dest}`);
  } catch (err) {
    console.error('[Google OAuth] Callback error:', err);
    res.redirect(`${env.FRONTEND_URL}/#/login?error=oauth_failed`);
  }
});

// ─── Clerk SSO Auth (commented out — using Google OAuth) ─────────────────────
// export const clerkAuth = asyncHandler(async (req: Request, res: Response) => { ... });
