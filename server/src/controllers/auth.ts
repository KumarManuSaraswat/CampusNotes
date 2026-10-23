import type { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError, ok, wrap } from '../utils/http.js';
import { readEnv } from '../config/env.js';
const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
});
const loginSchema = z.object({ email: z.string().email().toLowerCase(), password: z.string() });
const publicUser = (u: any) => ({
  id: String(u.id),
  name: u.name,
  email: u.email,
  role: u.role,
  createdAt: u.createdAt,
});
function setSession(res: any, user: any) {
  const env = readEnv();
  const token = jwt.sign({ sub: String(user.id) }, env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('campusnotes_session', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}
export function authRoutes(router: Router) {
  router.post(
    '/auth/register',
    wrap(async (req, res) => {
      const data = registerSchema.parse(req.body);
      if (await User.exists({ email: data.email }))
        throw new HttpError(409, 'EMAIL_EXISTS', 'An account with this email already exists.');
      const user = await User.create({
        name: data.name,
        email: data.email,
        passwordHash: await bcrypt.hash(data.password, 12),
      });
      setSession(res, user);
      ok(res, publicUser(user), 'Account created.', 201);
    }),
  );
  router.post(
    '/auth/login',
    wrap(async (req, res) => {
      const data = loginSchema.parse(req.body);
      const user = await User.findOne({ email: data.email }).select('+passwordHash');
      if (!user || !(await bcrypt.compare(data.password, user.passwordHash)))
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      setSession(res, user);
      ok(res, publicUser(user), 'Logged in.');
    }),
  );
  router.post('/auth/logout', (_req, res) => {
    const env = readEnv();
    res.clearCookie('campusnotes_session', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    });
    ok(res, null, 'Logged out.');
  });
  router.get(
    '/auth/me',
    requireAuth,
    wrap(async (req, res) => {
      const user = await User.findById(req.actor!.id);
      ok(res, publicUser(user));
    }),
  );
}
