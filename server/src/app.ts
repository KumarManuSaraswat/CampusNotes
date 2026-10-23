import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { ZodError } from 'zod';
import { readEnv } from './config/env.js';
import { HttpError } from './utils/http.js';
import { authRoutes } from './controllers/auth.js';
import { noteRoutes } from './controllers/notes.js';
import { communityRoutes } from './controllers/community.js';
const env = readEnv();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', (req, _res, next) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin');
    if (origin !== env.CLIENT_URL)
      return next(new HttpError(403, 'INVALID_ORIGIN', 'Request origin is not allowed.'));
  }
  next();
});
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
const limit = (count: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: count,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
      }),
  });
const router = express.Router();
router.use('/auth', limit(30));
router.use('/notes', limit(120));
router.use('/requests', limit(60));
authRoutes(router);
noteRoutes(router);
communityRoutes(router);
app.use('/api', router);
app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Endpoint not found.')));
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError)
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      },
    });
  if (error instanceof multer.MulterError)
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FILE',
        message:
          error.code === 'LIMIT_FILE_SIZE'
            ? `File exceeds ${env.MAX_FILE_MB} MB.`
            : 'Invalid file upload.',
      },
    });
  if (error instanceof SyntaxError && 'body' in error)
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON request.' },
    });
  if (error instanceof HttpError)
    return res
      .status(error.status)
      .json({ success: false, error: { code: error.code, message: error.message } });
  if (error?.code === 11000)
    return res
      .status(409)
      .json({ success: false, error: { code: 'DUPLICATE', message: 'This item already exists.' } });
  console.error(error);
  return res.status(500).json({
    success: false,
    error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' },
  });
});
export default app;
