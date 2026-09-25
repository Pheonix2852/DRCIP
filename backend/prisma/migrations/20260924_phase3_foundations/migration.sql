-- Phase 3 Foundations
-- Convert Resource.location and Shelter.location from jsonb to geography(Point,4326)
-- and change Shelter.status from TEXT to the ShelterStatus enum.
-- Mirrors 20260922_fix_incident_location.

-- ============================ Resource ============================
DROP TRIGGER IF EXISTS trg_resource_location_geog ON "Resource";
DROP FUNCTION IF EXISTS sync_resource_location_geog();
ALTER TABLE "Resource" DROP COLUMN IF EXISTS "location_geog";
DROP INDEX IF EXISTS "Resource_location_geog_idx";

ALTER TABLE "Resource" ADD COLUMN "location_new" geography(Point, 4326);

UPDATE "Resource"
SET "location_new" = ST_SetSRID(ST_MakePoint(
  ("location"->>'lng')::float8,
  ("location"->>'lat')::float8
), 4326)::geography
WHERE "location" IS NOT NULL
  AND jsonb_typeof("location") = 'object'
  AND "location" ? 'lat'
  AND "location" ? 'lng';

ALTER TABLE "Resource" DROP COLUMN "location";
ALTER TABLE "Resource" RENAME COLUMN "location_new" TO "location";
CREATE INDEX "Resource_location_idx" ON "Resource" USING GIST ("location");

-- ============================ Shelter =============================
DROP TRIGGER IF EXISTS trg_shelter_location_geog ON "Shelter";
DROP FUNCTION IF EXISTS sync_shelter_location_geog();
ALTER TABLE "Shelter" DROP COLUMN IF EXISTS "location_geog";
DROP INDEX IF EXISTS "Shelter_location_geog_idx";

ALTER TABLE "Shelter" ADD COLUMN "location_new" geography(Point, 4326);

UPDATE "Shelter"
SET "location_new" = ST_SetSRID(ST_MakePoint(
  ("location"->>'lng')::float8,
  ("location"->>'lat')::float8
), 4326)::geography
WHERE "location" IS NOT NULL
  AND jsonb_typeof("location") = 'object'
  AND "location" ? 'lat'
  AND "location" ? 'lng';

ALTER TABLE "Shelter" DROP COLUMN "location";
ALTER TABLE "Shelter" RENAME COLUMN "location_new" TO "location";
ALTER TABLE "Shelter" ALTER COLUMN "location" SET NOT NULL;
CREATE INDEX "Shelter_location_idx" ON "Shelter" USING GIST ("location");

-- ======================= ShelterStatus enum =======================
CREATE TYPE "ShelterStatus" AS ENUM ('AVAILABLE', 'FULL', 'UNAVAILABLE');

ALTER TABLE "Shelter" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Shelter"
  ALTER COLUMN "status" TYPE "ShelterStatus"
  USING (CASE WHEN "status" IN ('AVAILABLE', 'FULL', 'UNAVAILABLE') THEN "status" ELSE 'AVAILABLE' END)::"ShelterStatus";
ALTER TABLE "Shelter" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';
