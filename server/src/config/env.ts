import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  CLIENT_URL: z.string().url(),
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  MAX_FILE_MB: z.coerce.number().positive().default(10),
  AI_ENABLED: z.enum(['true', 'false']).default('false'),
  AI_PROVIDER: z.enum(['gemini', 'groq']).default('gemini'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().optional(),
  GROQ_VISION_MODEL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GEMINI_RECOMMENDATION_MODEL: z.string().optional(),
  REQUEST_RECOMMENDATIONS_ENABLED: z.enum(['true', 'false']).default('true'),
  AI_MAX_CONCURRENT: z.coerce.number().int().min(1).max(8).default(2),
});
export function readEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success)
    throw new Error(
      'Missing or invalid server environment: ' +
        parsed.error.issues.map((i) => i.path.join('.')).join(', '),
    );
  return parsed.data;
}
