-- Add PostGIS spatial columns alongside jsonb fields
-- Prisma writes to jsonb; triggers auto-sync to geography/geometry for spatial queries

-- Incident: add geography column + trigger
ALTER TABLE "Incident" ADD COLUMN "location_geog" geography(Point, 4326);
CREATE OR REPLACE FUNCTION sync_incident_location_geog() RETURNS trigger AS $$
BEGIN
  IF NEW."location" IS NOT NULL AND NEW."location" ? 'lat' AND NEW."location" ? 'lng' THEN
    NEW."location_geog" := ST_SetSRID(ST_MakePoint(
      (NEW."location"->>'lng')::float8,
      (NEW."location"->>'lat')::float8
    ), 4326)::geography;
  ELSE
    NEW."location_geog" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_incident_location_geog
  BEFORE INSERT OR UPDATE OF "location" ON "Incident"
  FOR EACH ROW EXECUTE FUNCTION sync_incident_location_geog();
CREATE INDEX "Incident_location_geog_idx" ON "Incident" USING GIST ("location_geog");

-- Resource: add geography column + trigger
ALTER TABLE "Resource" ADD COLUMN "location_geog" geography(Point, 4326);
CREATE OR REPLACE FUNCTION sync_resource_location_geog() RETURNS trigger AS $$
BEGIN
  IF NEW."location" IS NOT NULL AND NEW."location" ? 'lat' AND NEW."location" ? 'lng' THEN
    NEW."location_geog" := ST_SetSRID(ST_MakePoint(
      (NEW."location"->>'lng')::float8,
      (NEW."location"->>'lat')::float8
    ), 4326)::geography;
  ELSE
    NEW."location_geog" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_resource_location_geog
  BEFORE INSERT OR UPDATE OF "location" ON "Resource"
  FOR EACH ROW EXECUTE FUNCTION sync_resource_location_geog();
CREATE INDEX "Resource_location_geog_idx" ON "Resource" USING GIST ("location_geog");

-- Shelter: add geography column + trigger
ALTER TABLE "Shelter" ADD COLUMN "location_geog" geography(Point, 4326);
CREATE OR REPLACE FUNCTION sync_shelter_location_geog() RETURNS trigger AS $$
BEGIN
  IF NEW."location" IS NOT NULL AND NEW."location" ? 'lat' AND NEW."location" ? 'lng' THEN
    NEW."location_geog" := ST_SetSRID(ST_MakePoint(
      (NEW."location"->>'lng')::float8,
      (NEW."location"->>'lat')::float8
    ), 4326)::geography;
  ELSE
    NEW."location_geog" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_shelter_location_geog
  BEFORE INSERT OR UPDATE OF "location" ON "Shelter"
  FOR EACH ROW EXECUTE FUNCTION sync_shelter_location_geog();
CREATE INDEX "Shelter_location_geog_idx" ON "Shelter" USING GIST ("location_geog");

-- ResponseZone: add geometry column + trigger
ALTER TABLE "ResponseZone" ADD COLUMN "geometry_geom" geometry(Polygon, 4326);
CREATE OR REPLACE FUNCTION sync_responsezone_geometry_geom() RETURNS trigger AS $$
BEGIN
  IF NEW."geometry" IS NOT NULL AND jsonb_typeof(NEW."geometry") = 'object' THEN
    NEW."geometry_geom" := ST_SetSRID(ST_GeomFromGeoJSON(NEW."geometry"::text), 4326);
  ELSE
    NEW."geometry_geom" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_responsezone_geometry_geom
  BEFORE INSERT OR UPDATE OF "geometry" ON "ResponseZone"
  FOR EACH ROW EXECUTE FUNCTION sync_responsezone_geometry_geom();
CREATE INDEX "ResponseZone_geometry_geom_idx" ON "ResponseZone" USING GIST ("geometry_geom");

-- WeatherObservation: existing geography column, keep in sync with lat/lng
CREATE OR REPLACE FUNCTION sync_weatherobservation_location() RETURNS trigger AS $$
BEGIN
  IF NEW."latitude" IS NOT NULL AND NEW."longitude" IS NOT NULL THEN
    NEW."location" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  ELSE
    NEW."location" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_weatherobservation_location
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "WeatherObservation"
  FOR EACH ROW EXECUTE FUNCTION sync_weatherobservation_location();