-- AlterTable
ALTER TABLE "CriminalProfile" ADD COLUMN     "voterId" TEXT;

-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "drivingLicense" TEXT,
ADD COLUMN     "voterId" TEXT;

-- CreateIndex
CREATE INDEX "CriminalProfile_aadhaarHash_idx" ON "CriminalProfile"("aadhaarHash");

-- CreateIndex
CREATE INDEX "CriminalProfile_passportNumber_idx" ON "CriminalProfile"("passportNumber");

-- CreateIndex
CREATE INDEX "CriminalProfile_voterId_idx" ON "CriminalProfile"("voterId");

-- CreateIndex
CREATE INDEX "CriminalProfile_drivingLicense_idx" ON "CriminalProfile"("drivingLicense");

-- CreateIndex
CREATE INDEX "Guest_aadhaarHash_idx" ON "Guest"("aadhaarHash");

-- CreateIndex
CREATE INDEX "Guest_voterId_idx" ON "Guest"("voterId");

-- CreateIndex
CREATE INDEX "Guest_drivingLicense_idx" ON "Guest"("drivingLicense");
