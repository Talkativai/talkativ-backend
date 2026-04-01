import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import prisma from '../config/db.js';
import { BCRYPT_SALT_ROUNDS } from '../utils/constants.js';
import { ApiError } from '../utils/apiError.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ─── Password ────────────────────────────────────────────────────────────────
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// ─── JWT ─────────────────────────────────────────────────────────────────────
export const generateAccessToken = (payload: { userId: string; email: string; role: string }): string => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as any });
};

export const generateRefreshToken = async (userId: string): Promise<string> => {
  const token = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  await prisma.refreshToken.create({
    data: { token, userId, expiresAt },
  });

  return token;
};

export const generateTokenPair = async (user: { id: string; email: string; role: string }): Promise<TokenPair> => {
  const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = await generateRefreshToken(user.id);
  return { accessToken, refreshToken };
};

export const rotateRefreshToken = async (oldToken: string): Promise<TokenPair & { user: { id: string; email: string; firstName: string; lastName: string; role: string } }> => {
  const stored = await prisma.refreshToken.findUnique({ where: { token: oldToken } });
  if (!stored) throw ApiError.unauthorized('Invalid refresh token');
  if (stored.expiresAt < new Date()) {
    await prisma.refreshToken.deleteMany({ where: { id: stored.id } });
    throw ApiError.unauthorized('Refresh token expired');
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user) throw ApiError.unauthorized('User not found');

  // Delete old token — use deleteMany so a duplicate concurrent request doesn't crash
  const deleted = await prisma.refreshToken.deleteMany({ where: { id: stored.id } });
  if (deleted.count === 0) throw ApiError.unauthorized('Refresh token already used');

  // Generate new pair and return with fresh user data
  const tokens = await generateTokenPair(user);
  return {
    ...tokens,
    user: { id: user.id, email: user.email, firstName: user.firstName || '', lastName: user.lastName || '', role: user.role },
  };
};

export const revokeAllUserTokens = async (userId: string): Promise<void> => {
  await prisma.refreshToken.deleteMany({ where: { userId } });
};

// ─── Sessions ────────────────────────────────────────────────────────────────
export const createSession = async (userId: string, device: string, ip: string, location: string) => {
  const existing = await prisma.session.findFirst({ where: { userId, device } });
  if (existing) {
    return prisma.session.update({
      where: { id: existing.id },
      data: { ip, location, lastActive: new Date() },
    });
  }
  return prisma.session.create({ data: { userId, device, ip, location } });
};
