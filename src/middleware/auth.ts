import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import prisma from '../config/db.js';

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
  businessId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    return next(ApiError.forbidden('Admin access required'));
  }
  next();
};

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Missing or invalid authorization header');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthPayload;

    // Verify user still exists and fetch businessId in one query
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { business: { select: { id: true } } },
    });
    if (!user) {
      throw ApiError.unauthorized('User no longer exists');
    }

    if (user.status === 'SUSPENDED') {
      throw ApiError.forbidden('Your account has been suspended. Please contact support.');
    }

    req.user = { ...decoded, businessId: user.business?.id };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(ApiError.unauthorized('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(ApiError.unauthorized('Token expired'));
    } else {
      next(error);
    }
  }
};
