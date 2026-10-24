DROP TRIGGER IF EXISTS "trg_weatherobservation_location"
ON public."WeatherObservation";

DROP FUNCTION IF EXISTS public.sync_weatherobservation_location();