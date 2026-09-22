-- Fix Incident.location to be geography(Point,4326) as per authoritative schema
-- Remove redundant location_geog column and sync trigger

-- 1. Drop the trigger and function that syncs JSON to geography
DROP TRIGGER IF EXISTS trg_incident_location_geog ON "Incident";
DROP FUNCTION IF EXISTS sync_incident_location_geog();

-- 2. Drop the redundant geography column and its index
ALTER TABLE "Incident" DROP COLUMN IF EXISTS "location_geog";
DROP INDEX IF EXISTS "Incident_location_geog_idx";

-- 3. Add new geography column
ALTER TABLE "Incident" ADD COLUMN "location_new" geography(Point, 4326);

-- 3b. Backfill from jsonb location (extract lat/lng)
UPDATE "Incident"
SET "location_new" = ST_SetSRID(ST_MakePoint(
  ("location"->>'lng')::float8,
  ("location"->>'lat')::float8
), 4326)::geography
WHERE "location" IS NOT NULL
  AND jsonb_typeof("location") = 'object'
  AND "location" ? 'lat'
  AND "location" ? 'lng';

-- 4. Drop old jsonb location
ALTER TABLE "Incident" DROP COLUMN "location";

-- 5. Rename new column to location
ALTER TABLE "Incident" RENAME COLUMN "location_new" TO "location";

-- 6. Make location NOT NULL (required per spec)
ALTER TABLE "Incident" ALTER COLUMN "location" SET NOT NULL;

-- 7. Create GiST index for spatial queries
CREATE INDEX "Incident_location_idx" ON "Incident" USING GIST ("location");