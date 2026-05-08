// Runs via jest.config.ts `setupFiles` — BEFORE any module is imported.
// Sets all required env vars so env.ts Zod validation passes in test context.
process.env.NODE_ENV = 'test';
process.env.PORT = '4001';
process.env.API_VERSION = 'v1';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/safestay_test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-characters-long!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-long!!!!!';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.UPLOAD_DIR = './uploads';
process.env.MAX_FILE_SIZE_MB = '10';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX_REQUESTS = '100';
process.env.AUTH_RATE_LIMIT_MAX = '10';
process.env.LOG_LEVEL = 'error';
process.env.LOG_DIR = './logs';
process.env.HOTEL_FRONTEND_ORIGIN = 'http://localhost:3000';
process.env.POLICE_FRONTEND_ORIGIN = 'http://localhost:3001';
// Required by hardening pass — AES-256 key (64 hex chars = 32 bytes)
process.env.AADHAAR_ENCRYPTION_KEY = 'a'.repeat(64); // test-only key — never use in production
process.env.SWAGGER_USERNAME = 'admin';
process.env.SWAGGER_PASSWORD = 'testpass!';
process.env.FILE_SERVE_SECRET = 'file-serve-test-secret-minimum-32-characters-ok';
