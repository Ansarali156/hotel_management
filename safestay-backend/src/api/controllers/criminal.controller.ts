/**
 * Criminal profile controller — authentication removed.
 *
 * Aadhaar is still encrypted (AES-256-GCM) before storage.
 * aadhaarEncrypted and aadhaarHash are excluded from ALL API responses.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CaseStatus, ThreatLevel } from '@prisma/client';
import { policePrisma } from '../../config/policeDatabase';
import { sendCreated, sendSuccess } from '../../utils/response';
import { AppError } from '../middleware/errorHandler';
import { encryptAadhaar, hashAadhaar } from '../../utils/encrypt';
import { enqueueInjection } from '../../queues/injectionQueue';

const normaliseGender = (v: string): 'MALE' | 'FEMALE' | 'OTHER' => {
  const u = v.toUpperCase();
  if (u === 'MALE' || u === 'M') return 'MALE';
  if (u === 'FEMALE' || u === 'F') return 'FEMALE';
  return 'OTHER';
};

const toStringArray = (v: string | string[] | undefined): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return v.split(',').map((s) => s.trim()).filter(Boolean);
};

const criminalSchema = z.object({
  fullName: z.string().min(2).max(200),
  aliases: z.array(z.string()).default([]),
  gender: z.string().optional(),
  complexion: z.string().optional(),
  dateOfBirth: z.string().datetime().optional(),
  approximateAge: z.coerce.number().int().optional(),
  age: z.coerce.number().int().optional(),
  heightCm: z.coerce.number().int().optional(),
  weightKg: z.coerce.number().int().optional(),
  identifyingMarks: z.string().optional(),
  distinguishingMarks: z.string().optional(),
  description: z.string().optional(),
  caseStatus: z.enum(['WANTED', 'ARRESTED', 'ABSCONDING', 'RELEASED', 'IN_CUSTODY', 'UNDER_INVESTIGATION', 'PAROLE']),
  threatLevel: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  crimeType: z.string().optional(),
  crimeTypes: z.array(z.string()).optional(),
  firNumbers: z.union([z.array(z.string()), z.string()]).optional(),
  warrantNumber: z.string().optional(),
  crimeDescription: z.string().optional(),
  aadhaarNumber: z.string().regex(/^\d{12}$/).optional(),
  panNumber: z.string().optional(),
  passportNumber: z.string().optional(),
  passport: z.string().optional(),
  drivingLicense: z.string().optional(),
  phones: z.union([z.array(z.string()), z.string()]).optional(),
  phone: z.string().optional(),
  emails: z.union([z.array(z.string()), z.string()]).optional(),
  emailAddresses: z.string().optional(),
  lastKnownAddress: z.string().optional(),
  residentialAddress: z.string().optional(),
  firStationId: z.string().uuid().optional(),
});

const criminalUpdateSchema = criminalSchema.partial();

function preProcessBody(body: Record<string, any>): Record<string, any> {
  const out = { ...body };
  const jsonArrayKeys = ['aliases', 'crimeTypes', 'firNumbers', 'phones', 'emails'];
  for (const key of jsonArrayKeys) {
    if (typeof out[key] === 'string') {
      try { out[key] = JSON.parse(out[key]); } catch { /* leave as string */ }
    }
  }
  if (typeof out.age === 'string' && out.age) out.age = Number(out.age);
  if (typeof out.approximateAge === 'string' && out.approximateAge) out.approximateAge = Number(out.approximateAge);
  if (typeof out.heightCm === 'string' && out.heightCm) out.heightCm = Number(out.heightCm);
  if (typeof out.weightKg === 'string' && out.weightKg) out.weightKg = Number(out.weightKg);
  return out;
}

export const createCriminalProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // requirePoliceAuth guarantees req.user.sub is a valid police officer id.
    const enteredById = req.user?.sub;
    if (!enteredById || req.user?.portalType !== 'POLICE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Police authentication required');
    }

    const raw = criminalSchema.parse(preProcessBody(req.body));

    const genderNorm = raw.gender ? normaliseGender(raw.gender) : 'OTHER';
    const crimeTypeNorm =
      raw.crimeTypes && raw.crimeTypes.length > 0
        ? raw.crimeTypes.join(', ')
        : raw.crimeType ?? 'Unknown';
    const firNumbersNorm = toStringArray(raw.firNumbers);
    const phonesNorm = toStringArray(raw.phones ?? raw.phone);
    const emailsNorm = toStringArray(raw.emails ?? raw.emailAddresses);
    const passportNorm = raw.passportNumber ?? raw.passport;
    const addressNorm = raw.lastKnownAddress ?? raw.residentialAddress;
    const marksNorm = raw.identifyingMarks ?? raw.distinguishingMarks;
    const ageNorm = raw.approximateAge ?? raw.age;
    const crimeDescNorm = raw.crimeDescription ?? raw.description;

    // Resolve FIR station: prefer the request, fall back to the officer's own
    // station, and finally to any seeded station for dev/demo data.
    let stationId = raw.firStationId ?? req.user?.stationId ?? undefined;
    let jurisdictionPath = req.user?.jurisdictionPath ?? '/';
    if (stationId) {
      const station = await policePrisma.station.findUnique({ where: { id: stationId } });
      if (!station) throw new AppError(404, 'STATION_NOT_FOUND', 'FIR Station not found');

      // Officer can only file FIRs for stations within their jurisdiction.
      // jurisdictionPath is a "/"-separated tree (state/zone/range/district/
      // station) — an officer's authority extends to any station whose path
      // starts with their own. E.g. an SI at "state1/zone1" can file FIRs
      // for "state1/zone1/range1/station1" but NOT "state2/zone2/...".
      const officerPath = req.user?.jurisdictionPath ?? '';
      if (officerPath && !station.jurisdictionPath.startsWith(officerPath)) {
        throw new AppError(
          403,
          'OUT_OF_JURISDICTION',
          'Cannot file FIR for a station outside your jurisdiction'
        );
      }
      jurisdictionPath = station.jurisdictionPath;
    } else {
      const firstStation = await policePrisma.station.findFirst();
      if (firstStation) {
        stationId = firstStation.id;
        jurisdictionPath = firstStation.jurisdictionPath;
      }
    }
    if (!stationId) {
      throw new AppError(400, 'STATION_REQUIRED', 'No police station is configured for this deployment');
    }

    let aadhaarEncrypted: string | undefined;
    let aadhaarHash: string | undefined;
    if (raw.aadhaarNumber) {
      aadhaarEncrypted = encryptAadhaar(raw.aadhaarNumber);
      aadhaarHash = hashAadhaar(raw.aadhaarNumber);
    }

    const profile = await policePrisma.criminalProfile.create({
      data: {
        fullName: raw.fullName,
        aliases: raw.aliases ?? [],
        gender: genderNorm,
        complexion: raw.complexion,
        dateOfBirth: raw.dateOfBirth ? new Date(raw.dateOfBirth) : null,
        approximateAge: ageNorm,
        heightCm: raw.heightCm,
        weightKg: raw.weightKg,
        identifyingMarks: marksNorm,
        caseStatus: raw.caseStatus,
        threatLevel: raw.threatLevel,
        crimeType: crimeTypeNorm,
        firNumbers: firNumbersNorm,
        warrantNumber: raw.warrantNumber,
        crimeDescription: crimeDescNorm,
        aadhaarEncrypted: aadhaarEncrypted ?? null,
        aadhaarHash: aadhaarHash ?? null,
        panNumber: raw.panNumber,
        passportNumber: passportNorm,
        drivingLicense: raw.drivingLicense,
        phones: phonesNorm,
        emails: emailsNorm,
        lastKnownAddress: addressNorm,
        photoPath: req.file?.path,
        firStationId: stationId,
        jurisdictionPath,
        enteredById,
      },
    });

    if (['CRITICAL', 'HIGH'].includes(raw.threatLevel)) {
      enqueueInjection({
        criminalId: profile.id,
        jurisdictionPath,
        triggeredByOfficerId: enteredById,
        threatLevel: raw.threatLevel,
        triggeredAt: new Date().toISOString(),
      }).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[CriminalController] Injection enqueue failed:', msg);
      });
    }

    return sendCreated(res, { criminalId: profile.id }, 'Criminal profile created');
  } catch (err) {
    next(err);
  }
};

export const updateCriminalProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const raw = criminalUpdateSchema.parse(preProcessBody(req.body));

    const existing = await policePrisma.criminalProfile.findFirst({
      where: { id, isActive: true },
    });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Criminal profile not found');

    const genderNorm = raw.gender ? normaliseGender(raw.gender) : undefined;
    const crimeTypeNorm =
      raw.crimeTypes && raw.crimeTypes.length > 0 ? raw.crimeTypes.join(', ') : raw.crimeType;
    const firNumbersNorm = raw.firNumbers !== undefined ? toStringArray(raw.firNumbers) : undefined;
    const phonesNorm = (raw.phones !== undefined || raw.phone !== undefined) ? toStringArray(raw.phones ?? raw.phone) : undefined;
    const emailsNorm = (raw.emails !== undefined || raw.emailAddresses !== undefined) ? toStringArray(raw.emails ?? raw.emailAddresses) : undefined;
    const passportNorm = raw.passportNumber ?? raw.passport;
    const addressNorm = raw.lastKnownAddress ?? raw.residentialAddress;
    const marksNorm = raw.identifyingMarks ?? raw.distinguishingMarks;
    const ageNorm = raw.approximateAge ?? raw.age;

    let aadhaarEncrypted: string | undefined;
    let aadhaarHash: string | undefined;
    if (raw.aadhaarNumber) {
      aadhaarEncrypted = encryptAadhaar(raw.aadhaarNumber);
      aadhaarHash = hashAadhaar(raw.aadhaarNumber);
    }

    const updated = await policePrisma.criminalProfile.update({
      where: { id },
      data: {
        ...(raw.fullName && { fullName: raw.fullName }),
        ...(raw.aliases && { aliases: raw.aliases }),
        ...(genderNorm && { gender: genderNorm }),
        ...(raw.complexion !== undefined && { complexion: raw.complexion }),
        ...(raw.dateOfBirth && { dateOfBirth: new Date(raw.dateOfBirth) }),
        ...(ageNorm !== undefined && { approximateAge: ageNorm }),
        ...(raw.heightCm !== undefined && { heightCm: raw.heightCm }),
        ...(raw.weightKg !== undefined && { weightKg: raw.weightKg }),
        ...(marksNorm !== undefined && { identifyingMarks: marksNorm }),
        ...(raw.caseStatus && { caseStatus: raw.caseStatus }),
        ...(raw.threatLevel && { threatLevel: raw.threatLevel }),
        ...(crimeTypeNorm && { crimeType: crimeTypeNorm }),
        ...(firNumbersNorm && { firNumbers: firNumbersNorm }),
        ...(raw.warrantNumber !== undefined && { warrantNumber: raw.warrantNumber }),
        ...(raw.crimeDescription !== undefined && { crimeDescription: raw.crimeDescription }),
        ...(aadhaarEncrypted && { aadhaarEncrypted }),
        ...(aadhaarHash && { aadhaarHash }),
        ...(raw.panNumber !== undefined && { panNumber: raw.panNumber }),
        ...(passportNorm !== undefined && { passportNumber: passportNorm }),
        ...(raw.drivingLicense !== undefined && { drivingLicense: raw.drivingLicense }),
        ...(phonesNorm && { phones: phonesNorm }),
        ...(emailsNorm && { emails: emailsNorm }),
        ...(addressNorm !== undefined && { lastKnownAddress: addressNorm }),
        ...(req.file?.path && { photoPath: req.file.path }),
      },
      select: { id: true, fullName: true, caseStatus: true, threatLevel: true, updatedAt: true },
    });

    if (raw.threatLevel && ['CRITICAL', 'HIGH'].includes(raw.threatLevel)) {
      enqueueInjection({
        criminalId: id,
        jurisdictionPath: existing.jurisdictionPath,
        triggeredByOfficerId: 'system',
        threatLevel: raw.threatLevel,
        triggeredAt: new Date().toISOString(),
      }).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[CriminalController] Injection enqueue on update failed:', msg);
      });
    }

    return sendSuccess(res, updated, 'Criminal profile updated');
  } catch (err) {
    next(err);
  }
};

export const getCriminalProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const profile = await policePrisma.criminalProfile.findFirst({
      where: { id, isActive: true },
      select: {
        id: true, fullName: true, aliases: true, gender: true, complexion: true,
        dateOfBirth: true, approximateAge: true, heightCm: true, weightKg: true,
        identifyingMarks: true,
        caseStatus: true, threatLevel: true, crimeType: true, firNumbers: true,
        warrantNumber: true, crimeDescription: true,
        panNumber: true, passportNumber: true, drivingLicense: true,
        phones: true, emails: true, lastKnownAddress: true,
        jurisdictionPath: true, createdAt: true, updatedAt: true,
        enteredBy: { select: { badgeId: true, fullName: true } },
        firStation: { select: { name: true } },
      },
    });

    if (!profile) throw new AppError(404, 'NOT_FOUND', 'Criminal profile not found');
    return sendSuccess(res, profile, 'Criminal profile loaded');
  } catch (err) {
    next(err);
  }
};

export const listCriminalProfiles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      page = '1',
      limit = '20',
      search,
      threatLevel,
      caseStatus,
    } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, parseInt(limit));

    const where: {
      isActive: boolean;
      OR?: Array<{ fullName?: { contains: string; mode: 'insensitive' }; aliases?: { has: string } }>;
      threatLevel?: ThreatLevel;
      caseStatus?: CaseStatus;
    } = { isActive: true };

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { aliases: { has: search } },
      ];
    }
    if (threatLevel && Object.values(ThreatLevel).includes(threatLevel as ThreatLevel)) {
      where.threatLevel = threatLevel as ThreatLevel;
    }
    if (caseStatus && Object.values(CaseStatus).includes(caseStatus as CaseStatus)) {
      where.caseStatus = caseStatus as CaseStatus;
    }

    const [total, profiles] = await policePrisma.$transaction([
      policePrisma.criminalProfile.count({ where }),
      policePrisma.criminalProfile.findMany({
        where,
        select: {
          id: true, fullName: true, aliases: true, threatLevel: true,
          caseStatus: true, crimeType: true, createdAt: true,
        },
        orderBy: [{ threatLevel: 'asc' }, { createdAt: 'desc' }],
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return sendSuccess(res, {
      profiles,
      pagination: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    next(err);
  }
};

export const deleteCriminalProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const existing = await policePrisma.criminalProfile.findFirst({
      where: { id, isActive: true },
    });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Criminal profile not found');

    await policePrisma.criminalProfile.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return sendSuccess(res, null, 'Criminal profile deleted');
  } catch (err) {
    next(err);
  }
};
