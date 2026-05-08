/**
 * Socket.IO server — police real-time alert delivery.
 *
 * STEALTH: This module is NEVER imported by hotel-domain controllers.
 * Hotel portal has zero knowledge this exists.
 *
 * Flow:
 *   1. initSocketIO(httpServer) — called once at startup from index.ts
 *   2. Police clients authenticate via JWT in handshake.auth.token
 *   3. Authenticated officers are joined to the "police_officers" room
 *   4. emitCriminalMatchAlert() broadcasts to that room when a match is found
 */

import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { env } from './env';
import { logger } from '../utils/logger';

let io: Server | null = null;

export interface CriminalMatchPayload {
  alertId: string;
  criminalProfile: {
    id: string;
    fullName: string;
    aliases: string[];
    crimeType: string;
    threatLevel: string;
    caseStatus: string;
  };
  guestCheckin: {
    name: string;
    room: string | null;
    hotel: string | null;
    checkinTime: Date;
  };
  matchedField: string;
  threatLevel: string;
  timestamp: string;
}

export const initSocketIO = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
        if (/^https:\/\/[\w-]+\.onrender\.com$/.test(origin)) return cb(null, true);
        if (/^https:\/\/[\w-]+\.up\.railway\.app$/.test(origin)) return cb(null, true);
        if (origin === env.HOTEL_FRONTEND_ORIGIN || origin === env.POLICE_FRONTEND_ORIGIN) return cb(null, true);
        cb(new Error(`Socket CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    },
    path: '/socket.io',
    // Reconnection handled client-side
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── JWT auth middleware ──────────────────────────────────────────────────────
  io.use((socket: Socket, next) => {
    const token = (socket.handshake.auth as Record<string, string>).token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
        sub: string;
        portalType: string;
        rankLevel?: number;
        jurisdictionPath?: string;
      };
      if (payload.portalType !== 'POLICE') {
        return next(new Error('Police officers only'));
      }
      socket.data.userId = payload.sub;
      socket.data.jurisdictionPath = payload.jurisdictionPath ?? '';
      socket.data.rankLevel = payload.rankLevel ?? 14;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  // ── Connection handler ───────────────────────────────────────────────────────
  io.on('connection', (socket: Socket) => {
    // All authenticated police officers share the same room
    socket.join('police_officers');
    logger.info('[SocketIO] Police officer connected', {
      socketId: socket.id,
      userId: socket.data.userId,
    });

    socket.on('disconnect', (reason) => {
      logger.info('[SocketIO] Police officer disconnected', {
        socketId: socket.id,
        reason,
      });
    });

    // Allow client to manually acknowledge an alert (optional)
    socket.on('ACKNOWLEDGE_ALERT', (alertId: string) => {
      logger.info('[SocketIO] Alert acknowledged via socket', { alertId, userId: socket.data.userId });
    });
  });

  logger.info('[SocketIO] Server initialised — police_officers room ready');
  return io;
};

/** Emit a criminal match alert to all connected police officers. */
export const emitCriminalMatchAlert = (payload: CriminalMatchPayload): void => {
  if (!io) {
    logger.warn('[SocketIO] emit called before server init — event dropped');
    return;
  }
  io.to('police_officers').emit('CRIMINAL_MATCH_ALERT', payload);
  logger.info('[SocketIO] CRIMINAL_MATCH_ALERT emitted', {
    alertId: payload.alertId,
    criminal: payload.criminalProfile.fullName,
    threatLevel: payload.threatLevel,
  });
};

/** Emit a criminal match alert to all connected police officers. */
export interface VerificationProgressPayload {
  jobId: string;
  type: 'CRIMINAL_VS_GUESTS' | 'GUEST_VS_CRIMINALS' | 'SWEEP';
  status: 'PROCESSING' | 'COMPLETE' | 'FAILED';
  sourceName: string;   // criminal fullName or guest fullName
  sourceId: string;
  checked: number;
  total: number;
  alertsFound: number;
  pct: number;
  durationMs?: number;
}

export const emitVerificationProgress = (payload: VerificationProgressPayload): void => {
  if (!io) return;
  io.to('police_officers').emit('VERIFICATION_PROGRESS', payload);
};

/** Get the io instance (may be null before initSocketIO is called). */
export const getIO = (): Server | null => io;
