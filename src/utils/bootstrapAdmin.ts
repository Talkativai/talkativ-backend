import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';
import { env } from '../config/env.js';

export const bootstrapAdmin = async () => {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return;

  try {
    const existing = await prisma.user.findUnique({ where: { email: env.ADMIN_EMAIL } });
    if (existing) {
      // If found but not yet ADMIN role, upgrade it
      if (existing.role !== 'ADMIN') {
        await prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN' } });
        console.log(`[Admin] Upgraded ${env.ADMIN_EMAIL} to ADMIN role`);
      }
      return;
    }

    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
    await prisma.user.create({
      data: {
        email: env.ADMIN_EMAIL,
        passwordHash,
        firstName: 'Admin',
        lastName: 'Talkativ',
        role: 'ADMIN',
        emailVerified: true,
      },
    });
    console.log(`[Admin] Admin account created: ${env.ADMIN_EMAIL}`);
  } catch (e: any) {
    console.error('[Admin] bootstrapAdmin failed:', e.message);
  }
};
