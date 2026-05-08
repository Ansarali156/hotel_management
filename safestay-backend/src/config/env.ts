import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).default(4000),
  API_VERSION: z.string().default('v1'),

  // ── REQUIRED: Application MUST NOT start if any of these are missing ──────
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
  // Upstash Redis TCP URL — used by BullMQ workers in development.
  // In production (Render), use UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN instead.
  // TCP connections are blocked on Render; fallback to empty string to force REST API usage.
  REDIS_URL: z.string().optional().default(''),

  // ── Upstash Redis REST (preferred over legacy REDIS_URL) ──────────────────
  UPSTASH_REDIS_REST_URL: z.string().optional().default(''),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().default(''),

  // JWT secrets — REQUIRED. No defaults: a missing env var crashes startup
  // instead of booting with a publicly-known secret.
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),

  // AADHAAR_ENCRYPTION_KEY: 64 hex chars = 32 bytes → AES-256 key.
  // Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  // Application CRASHES at startup if this key is missing or not exactly 64 hex chars.
  AADHAAR_ENCRYPTION_KEY: z.string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      'AADHAAR_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes for AES-256)'
    ),

  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).default(10),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().default(10), // kept for rateLimiter.ts compatibility

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_DIR: z.string().default('./logs'),

  HOTEL_FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
  POLICE_FRONTEND_ORIGIN: z.string().url().default('http://localhost:3001'),
  // Comma-separated list of additional origins to allow through CORS
  // (e.g. preview URLs, additional custom domains). Empty in dev.
  ALLOWED_EXTRA_ORIGINS: z.string().optional().default(''),

  // Swagger basic-auth (production protection). Defaults are development-only.
  SWAGGER_USERNAME: z.string().min(1).default('admin'),
  // SWAGGER_PASSWORD has no default — production Swagger UI must require
  // a non-guessable password, and tests/dev provide their own.
  SWAGGER_PASSWORD: z.string().min(8),

  // FILE_SERVE_SECRET: signs the file-access HMAC tokens (min 32 chars).
  // REQUIRED — no default. A predictable HMAC secret lets any caller forge
  // file-access URLs, so the app refuses to start without one.
  FILE_SERVE_SECRET: z.string().min(32, 'FILE_SERVE_SECRET must be at least 32 characters'),

  // ── Email: Resend (HTTP API — works on Render) ────────────────────────────
  RESEND_API_KEY: z.string().optional().default(''),
  // Gmail SMTP kept for local dev fallback (blocked on Render free tier)
  GMAIL_USER: z.string().optional().default(''),
  GMAIL_APP_PASSWORD: z.string().optional().default(''),
  ALERT_EMAIL_FROM: z.string().optional().default(''),

  // ── V2: Alert dispatch (legacy SendGrid — kept for compatibility) ──────────
  SENDGRID_API_KEY: z.string().optional().default(''),
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),
  TWILIO_WHATSAPP_FROM: z.string().optional().default(''),

  // ── V2: Google Cloud Vision (OCR + face analysis) ─────────────────────────
  GCV_PROJECT_ID: z.string().optional().default(''),
  GCV_KEY_FILE: z.string().optional().default(''),

  // ── V2: AWS Rekognition (face age estimation) ─────────────────────────────
  AWS_ACCESS_KEY_ID: z.string().optional().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),
  AWS_REGION: z.string().optional().default('ap-south-1'),
  S3_BUCKET: z.string().optional().default(''),

  // ── Register scan: Anthropic Claude Vision API ───────────────────────────
  ANTHROPIC_API_KEY: z.string().optional().default(''),

  // ── V2: Cost control ───────────────────────────────────────────────────────
  FRUGAL_MODE: z.string().optional().default('false'),

  // ── V2: Police portal URL (for evidence package deep-links) ───────────────
  POLICE_PORTAL_URL: z.string().url().optional().default('http://localhost:3001'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables — app cannot start:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data!;
