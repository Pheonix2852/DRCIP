-- Phase 3.2 Field Teams: introduce TeamStatus enum for FieldTeam.status.
CREATE TYPE "TeamStatus" AS ENUM ('ACTIVE', 'DEPLOYED', 'UNAVAILABLE', 'MAINTENANCE');

ALTER TABLE "FieldTeam" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "FieldTeam"
  ALTER COLUMN "status" TYPE "TeamStatus"
  USING (CASE WHEN "status" IN ('ACTIVE', 'DEPLOYED', 'UNAVAILABLE', 'MAINTENANCE') THEN "status" ELSE 'ACTIVE' END)::"TeamStatus";
ALTER TABLE "FieldTeam" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
