import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { connectRedis } from './config/redis';
import { securityHeaders } from './api/middleware/securityHeaders';
import { globalRateLimiter } from './api/middleware/rateLimiter';
import { errorHandler } from './api/middleware/errorHandler';
import { logger } from './utils/logger';
import { setupSwagger } from './config/swagger';
import { initSocketIO } from './config/socketio';
import { prisma } from './config/database';

// Workers
import { startVerificationWorker, stopVerificationWorker } from './workers/verification.worker';
import { startSweepWorker, stopSweepWorker } from './workers/sweep.worker';
import { startInjectionWorker, stopInjectionWorker } from './workers/injection.worker';
import { startGuestVerificationWorker, stopGuestVerificationWorker } from './workers/guestVerification.worker';
import { startCleanupWorker, stopCleanupWorker } from './workers/cleanup.worker';

// Cron registrations
import { registerSweepCron } from './queues/sweepQueue';
import { registerCleanupCron } from './queues/cleanupQueue';

// Routes
import authRoutes from './api/routes/auth.routes';
import hotelRoutes from './api/routes/hotel.routes';
import guestRoutes from './api/routes/guest.routes';
import roomRoutes from './api/routes/room.routes';
import policeRoutes from './api/routes/police.routes';
import criminalRoutes from './api/routes/criminal.routes';
import verificationRoutes from './api/routes/verification.routes';
import dashboardRoutes from './api/routes/dashboard.routes';
import filesRoutes from './api/routes/files.routes';

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(securityHeaders);
app.use(
  helmet({
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────────
// Production: an explicit allowlist of
//   HOTEL_FRONTEND_ORIGIN, POLICE_FRONTEND_ORIGIN, and ALLOWED_EXTRA_ORIGINS
// (comma separated). Wildcards like *.onrender.com are no longer accepted
// because any other project on the same PaaS could otherwise hit our API.
// Development: localhost on any port is allowed to keep the DX smooth.
const EXTRA_ORIGINS = env.ALLOWED_EXTRA_ORIGINS
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = new Set<string>([
  env.HOTEL_FRONTEND_ORIGIN,
  env.POLICE_FRONTEND_ORIGIN,
  ...EXTRA_ORIGINS,
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
      if (env.NODE_ENV !== 'production' && /^http:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// Trust Railway/Render proxy so rate-limiter sees the real client IP from X-Forwarded-For
app.set('trust proxy', 1);

// ── Global rate limit ─────────────────────────────────────────────────────────
app.use(globalRateLimiter);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Swagger API docs ─────────────────────────────────────────────────────────
setupSwagger(app);

// ── API Routes — V1 ──────────────────────────────────────────────────────────
const API = `/api/${env.API_VERSION}`;
app.use(`${API}/auth`, authRoutes);
app.use(`${API}/hotels`, hotelRoutes);
app.use(`${API}/rooms`, roomRoutes);
app.use(`${API}/guests`, guestRoutes);
app.use(`${API}/police`, policeRoutes);
app.use(`${API}/criminals`, criminalRoutes);
app.use(`${API}/verification`, verificationRoutes);
app.use(`${API}/dashboard`, dashboardRoutes);
app.use(`${API}/files`, filesRoutes);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', version: env.API_VERSION, env: env.NODE_ENV })
);

// ── 404 catch-all (JSON, not HTML) ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    code: 'NOT_FOUND',
    path: req.path,
  });
});

// ── Error handler — MUST be last ─────────────────────────────────────────────
app.use(errorHandler);

// ── Server + Socket.IO ───────────────────────────────────────────────────────
// Exported so tests can import the app without starting the server/workers.
export const httpServer = http.createServer(app);
export const io = initSocketIO(httpServer);

// ── Startup (only when run as the main module, never from tests) ─────────────
if (require.main === module) {
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection — server remains running', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception — server remains running', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  });

  (async () => {
    // Redis — degrades to in-memory rate limiting if unreachable.
    // connectRedis() already logs the warn/info/error, so don't double-log here.
    try {
      await connectRedis();
    } catch (err) {
      logger.error('Redis connection failed — rate limiting degrades to fail-open', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Background workers — each logs its own connection errors and does not
    // crash the process if Redis is unavailable at boot.
    try {
      startVerificationWorker();
      startSweepWorker();
      startInjectionWorker();
      startGuestVerificationWorker();
      startCleanupWorker();
      logger.info('All BullMQ workers started');
    } catch (err) {
      logger.error('Worker startup error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Start HTTP server BEFORE cron registration so the API is always reachable
    // even when Redis is unavailable (cron registration can hang indefinitely).
    httpServer.listen(env.PORT, '0.0.0.0', () => {
      logger.info('SafeStay Backend running', { port: env.PORT, env: env.NODE_ENV });
    });

    // Repeating crons (sweep + cleanup). These no-op if Redis is unreachable.
    // Wrapped in a 5-second timeout to prevent blocking when Redis is down.
    const cronTimeout = (fn: () => Promise<void>, label: string) =>
      Promise.race([
        fn(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out (no Redis)`)), 5000)
        ),
      ]);

    try {
      await Promise.all([
        cronTimeout(registerSweepCron, 'SweepCron'),
        cronTimeout(registerCleanupCron, 'CleanupCron'),
      ]);
      logger.info('Cron schedulers registered');
    } catch (err) {
      logger.warn('Cron registration skipped — Redis unavailable', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully`);

      // 1. Stop accepting new HTTP connections
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });

      // 2. Close Socket.IO (disconnects all clients)
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });

      // 3. Stop workers, flush in-flight jobs, disconnect Prisma — in parallel
      await Promise.allSettled([
        stopVerificationWorker(),
        stopSweepWorker(),
        stopInjectionWorker(),
        stopGuestVerificationWorker(),
        stopCleanupWorker(),
        prisma.$disconnect(),
      ]);

      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.on('SIGINT', () => { void shutdown('SIGINT'); });
  })();
}

export default app;
