-- Passwordless police login: add phoneNumber column, make passwordHash optional
ALTER TABLE "PoliceUser" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "PoliceUser" ADD COLUMN "phoneNumber" TEXT;
CREATE INDEX "PoliceUser_phoneNumber_idx" ON "PoliceUser"("phoneNumber");
