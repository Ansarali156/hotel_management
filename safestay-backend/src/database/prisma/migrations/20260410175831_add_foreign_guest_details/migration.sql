-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CaseStatus" ADD VALUE 'IN_CUSTODY';
ALTER TYPE "CaseStatus" ADD VALUE 'UNDER_INVESTIGATION';
ALTER TYPE "CaseStatus" ADD VALUE 'PAROLE';

-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "ageEstimatedAt" TIMESTAMP(3),
ADD COLUMN     "estimatedAgeRange" JSONB,
ADD COLUMN     "ocrConfidence" DOUBLE PRECISION,
ADD COLUMN     "ocrPlatform" TEXT,
ADD COLUMN     "passportDateOfIssue" TIMESTAMP(3),
ADD COLUMN     "passportExpiry" TIMESTAMP(3),
ADD COLUMN     "passportNationality" TEXT,
ADD COLUMN     "passportPlaceOfIssue" TEXT,
ADD COLUMN     "visaNumber" TEXT,
ADD COLUMN     "visaType" TEXT,
ADD COLUMN     "visaValidTill" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MatchAlert" ADD COLUMN     "conflictDetected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dispatchError" TEXT,
ADD COLUMN     "dispatchStatus" TEXT,
ADD COLUMN     "dispatchToStations" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "dispatchedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Station" ADD COLUMN     "alertEmailContacts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "alertWhatsappNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "alertsEnabled" BOOLEAN NOT NULL DEFAULT true;
