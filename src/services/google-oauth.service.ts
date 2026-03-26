import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import prisma from '../config/db.js';
import * as authService from './auth.service.js';

const oauth2Client = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_CALLBACK_URL
);

// ─── Generate OAuth consent URL ─────────────────────────────────────────────
export const getAuthUrl = (state: string = 'login'): string => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    prompt: 'consent',
    state,
  });
};

// ─── Exchange auth code for tokens ──────────────────────────────────────────
export const getTokens = async (code: string) => {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

// ─── Get user info from Google ──────────────────────────────────────────────
export const getUserInfo = async (accessToken: string) => {
  oauth2Client.setCredentials({ access_token: accessToken });
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to get Google user info');
  return res.json() as Promise<{
    id: string;
    email: string;
    name: string;
    given_name: string;
    family_name: string;
    picture: string;
  }>;
};

// ─── Find or create user from Google profile ────────────────────────────────
export const findOrCreateUser = async (profile: {
  id: string;
  email: string;
  given_name: string;
  family_name: string;
}) => {
  // First check if user exists by googleId
  let user = await prisma.user.findUnique({ where: { googleId: profile.id } });
  if (user) return user;

  // Check if user exists by email (link accounts)
  user = await prisma.user.findUnique({ where: { email: profile.email } });
  if (user) {
    // Link Google account to existing user
    user = await prisma.user.update({
      where: { id: user.id },
      data: { googleId: profile.id, emailVerified: true },
    });
    return user;
  }

  // Create new user + business shell
  user = await prisma.user.create({
    data: {
      email: profile.email,
      firstName: profile.given_name || 'User',
      lastName: profile.family_name || '',
      googleId: profile.id,
      emailVerified: true,
      // No passwordHash for OAuth users
    },
  });

  // Create empty business shell
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

  return user;
};
