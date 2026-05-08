-- CreateEnum
CREATE TYPE "PortalType" AS ENUM ('HOTEL', 'POLICE');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "GuestType" AS ENUM ('DOMESTIC', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('WANTED', 'ARRESTED', 'ABSCONDING', 'RELEASED');

-- CreateEnum
CREATE TYPE "ThreatLevel" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'VERIFICATION_RUN');

-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Range" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,

    CONSTRAINT "Range_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rangeId" TEXT NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "jurisdictionPath" TEXT NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "contactNumber" TEXT,
    "address" TEXT,
    "licenseNumber" TEXT,
    "geoLat" DOUBLE PRECISION,
    "geoLng" DOUBLE PRECISION,
    "totalFloors" INTEGER NOT NULL,
    "roomsPerFloor" INTEGER NOT NULL,
    "maxGuestsPerRoom" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nearestStationId" TEXT,
    "jurisdictionPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "HotelRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "category" TEXT NOT NULL,
    "maxGuests" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" "Gender" NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "fatherName" TEXT,
    "email" TEXT,
    "panCard" TEXT,
    "address" TEXT,
    "guestType" "GuestType" NOT NULL DEFAULT 'DOMESTIC',
    "aadhaarEncrypted" TEXT,
    "aadhaarHash" TEXT,
    "passportNumber" TEXT,
    "formCPath" TEXT,
    "guestPhotoPath" TEXT,
    "idDocumentPath" TEXT,
    "checkInDate" TIMESTAMP(3) NOT NULL,
    "expectedCheckout" TIMESTAMP(3),
    "checkOutDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoliceRank" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "PoliceRank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoliceUser" (
    "id" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "rankId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "jurisdictionPath" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PoliceUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoliceRefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "policeUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PoliceRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriminalProfile" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "aliases" TEXT[],
    "gender" "Gender" NOT NULL,
    "complexion" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "approximateAge" INTEGER,
    "heightCm" INTEGER,
    "weightKg" INTEGER,
    "identifyingMarks" TEXT,
    "photoPath" TEXT,
    "caseStatus" "CaseStatus" NOT NULL,
    "threatLevel" "ThreatLevel" NOT NULL,
    "crimeType" TEXT NOT NULL,
    "firNumbers" TEXT[],
    "warrantNumber" TEXT,
    "crimeDescription" TEXT,
    "aadhaarEncrypted" TEXT,
    "aadhaarHash" TEXT,
    "panNumber" TEXT,
    "passportNumber" TEXT,
    "drivingLicense" TEXT,
    "phones" TEXT[],
    "emails" TEXT[],
    "lastKnownAddress" TEXT,
    "firStationId" TEXT NOT NULL,
    "jurisdictionPath" TEXT NOT NULL,
    "enteredById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CriminalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchAlert" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "criminalId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL,
    "matchBreakdown" JSONB NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "triggeredBy" TEXT NOT NULL,
    "reviewedByPoliceId" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorType" "PortalType" NOT NULL,
    "action" "AuditAction" NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "State_name_key" ON "State"("name");

-- CreateIndex
CREATE UNIQUE INDEX "State_code_key" ON "State"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_name_stateId_key" ON "Zone"("name", "stateId");

-- CreateIndex
CREATE UNIQUE INDEX "Range_name_zoneId_key" ON "Range"("name", "zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "District_name_rangeId_key" ON "District"("name", "rangeId");

-- CreateIndex
CREATE UNIQUE INDEX "Station_name_districtId_key" ON "Station"("name", "districtId");

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_email_key" ON "Hotel"("email");

-- CreateIndex
CREATE UNIQUE INDEX "HotelRefreshToken_token_key" ON "HotelRefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Room_hotelId_roomNumber_key" ON "Room"("hotelId", "roomNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PoliceRank_level_key" ON "PoliceRank"("level");

-- CreateIndex
CREATE UNIQUE INDEX "PoliceRank_title_key" ON "PoliceRank"("title");

-- CreateIndex
CREATE UNIQUE INDEX "PoliceUser_badgeId_key" ON "PoliceUser"("badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "PoliceUser_email_key" ON "PoliceUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PoliceRefreshToken_token_key" ON "PoliceRefreshToken"("token");

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Range" ADD CONSTRAINT "Range_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_rangeId_fkey" FOREIGN KEY ("rangeId") REFERENCES "Range"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_nearestStationId_fkey" FOREIGN KEY ("nearestStationId") REFERENCES "Station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRefreshToken" ADD CONSTRAINT "HotelRefreshToken_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoliceUser" ADD CONSTRAINT "PoliceUser_rankId_fkey" FOREIGN KEY ("rankId") REFERENCES "PoliceRank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoliceUser" ADD CONSTRAINT "PoliceUser_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoliceRefreshToken" ADD CONSTRAINT "PoliceRefreshToken_policeUserId_fkey" FOREIGN KEY ("policeUserId") REFERENCES "PoliceUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriminalProfile" ADD CONSTRAINT "CriminalProfile_firStationId_fkey" FOREIGN KEY ("firStationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriminalProfile" ADD CONSTRAINT "CriminalProfile_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "PoliceUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAlert" ADD CONSTRAINT "MatchAlert_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAlert" ADD CONSTRAINT "MatchAlert_criminalId_fkey" FOREIGN KEY ("criminalId") REFERENCES "CriminalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
