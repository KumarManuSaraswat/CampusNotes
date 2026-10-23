import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { HttpError } from '../utils/http.js';
import { readEnv } from '../config/env.js';
declare global {
  namespace Express {
    interface Request {
      actor?: { id: string; role: 'student' | 'moderator'; name: string };
    }
  }
}
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.campusnotes_session;
    if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Please log in to continue.');
    const payload = jwt.verify(token, readEnv().JWT_SECRET) as { sub: string };
    const user = await User.findById(payload.sub);
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Your session has expired.');
    req.actor = {
      id: String(user.id),
      role: user.role as 'student' | 'moderator',
      name: user.name,
    };
    next();
  } catch (error) {
    next(
      error instanceof jwt.JsonWebTokenError
        ? new HttpError(401, 'UNAUTHENTICATED', 'Your session has expired.')
        : error,
    );
  }
}
export const requireRole =
  (role: 'moderator') => (req: Request, _res: Response, next: NextFunction) =>
    req.actor?.role === role
      ? next()
      : next(new HttpError(403, 'FORBIDDEN', 'You do not have permission for this action.'));
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.campusnotes_session;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, readEnv().JWT_SECRET) as { sub: string };
    const user = await User.findById(payload.sub);
    if (user)
      req.actor = {
        id: String(user.id),
        role: user.role as 'student' | 'moderator',
        name: user.name,
      };
  } catch {}
  next();
}
