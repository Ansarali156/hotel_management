/**
 * Verification controller — authentication removed.
 * jurisdictionPath and officerId now come from query/body params.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { MatchStatus } from '@prisma/client';
import { policePrisma } from '../../config/policeDatabase';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../middleware/errorHandler';
import { enqueueVerification } from '../../queues/verificationQueue';

export const triggerManualVerification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // requirePoliceAuth ensures the caller is a valid officer. Use their
    // jurisdictionPath and id rather than trusting body/query params.
    const jurisdictionPath = req.user?.jurisdictionPath ?? '/';
    const officerId = req.user?.sub;
    if (!officerId) throw new AppError(401, 'UNAUTHORIZED', 'Police authentication required');

    const jobId = await enqueueVerification({
      jurisdictionPath,
      triggeredByOfficerId: officerId,
      triggeredAt: new Date().toISOString(),
    });

    return sendSuccess(
      res,
      { jobId, status: 'QUEUED' },
      'Verification job queued. Results will be available in /verification/alerts.',
      202
    );
  } catch (err) {
    next(err);
  }
};

export const getMatchAlert = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { alertId } = req.params;

    // id is the primary key — findUnique hits the PK prepared-statement path
    // and drops the extra LIMIT-1 planning step findFirst adds.
    const alert = await policePrisma.matchAlert.findUnique({
      where: { id: alertId },
      include: {
        guest: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            hotel: { select: { name: true } },
            room: { select: { roomNumber: true } },
          },
        },
        criminal: {
          select: {
            id: true,
            fullName: true,
            aliases: true,
            crimeType: true,
            threatLevel: true,
            caseStatus: true,
          },
        },
      },
    });

    if (!alert) throw new AppError(404, 'NOT_FOUND', 'Alert not found');
    return sendSuccess(res, alert, 'Alert loaded');
  } catch (err) {
    next(err);
  }
};

export const getMatchAlerts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '20', status, minScore } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, parseInt(limit));

    const where: {
      status?: MatchStatus;
      matchScore?: { gte: number };
    } = {};

    if (status && Object.values(MatchStatus).includes(status as MatchStatus)) {
      where.status = status as MatchStatus;
    }
    if (minScore) where.matchScore = { gte: parseFloat(minScore) };

    // $transaction with an array of two queries — gives us a consistent
    // snapshot (count and rows agree) and matches the test mocking pattern
    // (`prisma.$transaction` is mocked with `[total, alerts]`).
    const [total, alerts] = await policePrisma.$transaction([
      policePrisma.matchAlert.count({ where }),
      policePrisma.matchAlert.findMany({
        where,
        include: {
          guest: {
            select: {
              id: true,
              fullName: true,
              phoneNumber: true,
              hotel: { select: { name: true } },
            },
          },
          criminal: {
            select: {
              id: true,
              fullName: true,
              threatLevel: true,
              caseStatus: true,
            },
          },
        },
        orderBy: [{ matchScore: 'desc' }, { createdAt: 'desc' }],
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
    ] as const);

    return sendSuccess(res, {
      alerts,
      pagination: {
        total,
        page: pageNum,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const reviewMatchAlert = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { alertId } = req.params;
    const { status, notes } = z
      .object({
        status: z.enum(['CONFIRMED', 'DISMISSED']),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const officerId = req.user?.sub;
    if (!officerId || req.user?.portalType !== 'POLICE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Police authentication required');
    }

    const alert = await policePrisma.matchAlert.findFirst({
      where: { id: alertId },
    });
    if (!alert) throw new AppError(404, 'NOT_FOUND', 'Match alert not found');

    const updated = await policePrisma.matchAlert.update({
      where: { id: alertId },
      data: {
        status,
        reviewNotes: notes,
        reviewedByPoliceId: officerId,
      },
      select: { id: true, status: true, reviewNotes: true, updatedAt: true },
    });

    return sendSuccess(res, updated, 'Alert reviewed');
  } catch (err) {
    next(err);
  }
};
