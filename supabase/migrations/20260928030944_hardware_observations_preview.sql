-- Preview only. Prepared and locally tested before remote installation.
DO $$ BEGIN
 IF current_setting('geofield.preview_project_ref',true) IS DISTINCT FROM 'mujwsfhkocsuuahlrssn' THEN
 RAISE EXCEPTION 'hardware_preview_target_confirmation_required'; END IF;
END $$;

CREATE TABLE public.hardware_retention_state (
 org_id uuid PRIMARY KEY REFERENCES public.org_hardware_entitlements(org_id),
 purged_through timestamptz NOT NULL DEFAULT '-infinity'
);
CREATE TABLE public.hardware_observations (
 device_id uuid NOT NULL,
 event_id text COLLATE "C" NOT NULL CHECK(event_id ~ '^[a-zA-Z0-9_-]{1,96}$'),
 org_id uuid NOT NULL,
 tracker_id uuid NOT NULL,
 binding_id uuid NOT NULL REFERENCES public.tracker_device_bindings(id),
 recorded_at timestamptz NOT NULL CHECK(isfinite(recorded_at)),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 fix_valid boolean NOT NULL,
 latitude double precision,
 longitude double precision,
 PRIMARY KEY(device_id,event_id),
 FOREIGN KEY(org_id,device_id) REFERENCES public.tracker_devices(org_id,id),
 FOREIGN KEY(org_id,tracker_id) REFERENCES public.trackers(org_id,id),
 CHECK ((fix_valid AND latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
 OR (NOT fix_valid AND latitude IS NULL AND longitude IS NULL))
);
CREATE INDEX hardware_observations_retention ON public.hardware_observations(org_id,recorded_at);
CREATE INDEX hardware_observations_latest ON public.hardware_observations(org_id,tracker_id,recorded_at DESC,event_id DESC,device_id DESC) WHERE fix_valid;
CREATE INDEX hardware_observations_communication ON public.hardware_observations(org_id,tracker_id,received_at DESC);
CREATE INDEX hardware_observations_binding ON public.hardware_observations(binding_id);
ALTER TABLE public.hardware_retention_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hardware_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hardware_retention_state,public.hardware_observations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.hardware_retention_state,public.hardware_observations TO authenticated,service_role;
CREATE POLICY hardware_retention_admin_read ON public.hardware_retention_state FOR SELECT TO authenticated
 USING(public.has_org_role_active(org_id,ARRAY['owner','admin']::text[]));
CREATE POLICY hardware_observations_admin_read ON public.hardware_observations FOR SELECT TO authenticated
 USING(public.has_org_role_active(org_id,ARRAY['owner','admin']::text[]) AND recorded_at > greatest(
 clock_timestamp() - (SELECT e.retention_days * interval '1 day' FROM public.org_hardware_entitlements e WHERE e.org_id=hardware_observations.org_id),
 coalesce((SELECT r.purged_through FROM public.hardware_retention_state r WHERE r.org_id=hardware_observations.org_id),'-infinity'::timestamptz)));

-- Trusted backend supplies the authenticated device UUID, never a user-selected org/tracker.
-- Simulation only. Physical device credentials and HTTP gateway are outside this migration.
CREATE FUNCTION public.ingest_hardware_observation_preview(p_device_id uuid,p_observation jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 d public.tracker_devices%ROWTYPE; b public.tracker_device_bindings%ROWTYPE;
 t public.trackers%ROWTYPE; cfg public.org_hardware_entitlements%ROWTYPE;
 prev public.hardware_observations%ROWTYPE;
 ts timestamptz; received timestamptz; cutoff timestamptz;
 ev text; fix boolean; lat double precision; lon double precision;
BEGIN
 IF p_observation IS NULL OR jsonb_typeof(p_observation)<>'object' OR octet_length(p_observation::text)>2048 THEN RAISE EXCEPTION 'invalid_fields' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_observation) k WHERE k NOT IN ('version','event_id','recorded_at','fix_valid','latitude','longitude')) THEN RAISE EXCEPTION 'invalid_fields' USING ERRCODE='22023'; END IF;
 IF p_observation->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p_observation->'event_id') IS DISTINCT FROM 'string' OR (p_observation->>'event_id') !~ '^[a-zA-Z0-9_-]{1,96}$' THEN RAISE EXCEPTION 'invalid_event' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_observation->'recorded_at') IS DISTINCT FROM 'string' OR (p_observation->>'recorded_at') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' THEN RAISE EXCEPTION 'invalid_time' USING ERRCODE='22023'; END IF;
 BEGIN
 ts := (p_observation->>'recorded_at')::timestamptz;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'invalid_time' USING ERRCODE='22023'; END;
 IF NOT isfinite(ts) OR to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_observation->>'recorded_at' THEN RAISE EXCEPTION 'invalid_time' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_observation->'fix_valid') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid_fix' USING ERRCODE='22023'; END IF;
 fix := (p_observation->>'fix_valid')::boolean; ev:=p_observation->>'event_id';
 IF fix THEN
 IF jsonb_typeof(p_observation->'latitude') IS DISTINCT FROM 'number' OR jsonb_typeof(p_observation->'longitude') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'invalid_coordinates' USING ERRCODE='22023'; END IF;
 IF (p_observation->>'latitude')::numeric NOT BETWEEN -90 AND 90 OR (p_observation->>'longitude')::numeric NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'invalid_coordinates' USING ERRCODE='22023'; END IF;
 lat:=(p_observation->>'latitude')::double precision; lon:=(p_observation->>'longitude')::double precision;
 ELSE
 IF coalesce(p_observation->'latitude','null'::jsonb)<>'null'::jsonb OR coalesce(p_observation->'longitude','null'::jsonb)<>'null'::jsonb THEN RAISE EXCEPTION 'coordinates_without_fix' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT * INTO d FROM public.tracker_devices WHERE id=p_device_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'hardware_device_not_authorized' USING ERRCODE='42501'; END IF;
 PERFORM gnss_private.lock_org(d.org_id);
 -- Re-read after acquiring the org lock, compatible with inventory operations.
 SELECT * INTO STRICT d FROM public.tracker_devices WHERE id=p_device_id;
 SELECT * INTO STRICT cfg FROM public.org_hardware_entitlements WHERE org_id=d.org_id;
 IF NOT d.active OR NOT d.is_simulated OR d.identifier_kind<>'simulator' OR d.protocol<>'normalized-simulator-v1' OR NOT cfg.enabled OR NOT cfg.simulation_only THEN RAISE EXCEPTION 'hardware_device_not_authorized' USING ERRCODE='42501'; END IF;
 received:=clock_timestamp();
 SELECT greatest(received-cfg.retention_days*interval '1 day',coalesce((SELECT purged_through FROM public.hardware_retention_state WHERE org_id=d.org_id),'-infinity'::timestamptz)) INTO cutoff;
 IF ts<=cutoff THEN RAISE EXCEPTION 'expired_observation' USING ERRCODE='22023'; END IF;
 IF ts>received+interval '2 minutes' THEN RAISE EXCEPTION 'future_time' USING ERRCODE='22023'; END IF;
 SELECT * INTO prev FROM public.hardware_observations WHERE device_id=d.id AND event_id=ev;
 IF FOUND THEN
 IF ROW(prev.recorded_at,prev.fix_valid,prev.latitude,prev.longitude) IS DISTINCT FROM ROW(ts,fix,lat,lon) THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='23505'; END IF;
 RETURN jsonb_build_object('status','duplicate','tracker_id',prev.tracker_id,'received_at',prev.received_at);
 END IF;
 SELECT * INTO b FROM public.tracker_device_bindings WHERE device_id=d.id AND org_id=d.org_id AND started_at<=ts AND (ended_at IS NULL OR ts<ended_at);
 IF NOT FOUND THEN RAISE EXCEPTION 'hardware_binding_not_found' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT t FROM public.trackers WHERE id=b.tracker_id AND org_id=d.org_id;
 IF NOT t.active OR NOT t.is_simulated THEN RAISE EXCEPTION 'hardware_tracker_not_enabled' USING ERRCODE='42501'; END IF;
 IF t.retention_mode<>'full_route' THEN RAISE EXCEPTION 'hardware_retention_mode_not_supported' USING ERRCODE='22023'; END IF;
 INSERT INTO public.hardware_observations(device_id,event_id,org_id,tracker_id,binding_id,recorded_at,received_at,fix_valid,latitude,longitude)
 VALUES(d.id,ev,d.org_id,t.id,b.id,ts,received,fix,lat,lon);
 RETURN jsonb_build_object('status','stored','tracker_id',t.id,'received_at',received);
END $$;

-- Latest valid point is derived, not copied: no stale projection after purge, no retry heartbeat.
CREATE FUNCTION public.hardware_latest_preview(p_org_id uuid,p_tracker_id uuid)
RETURNS SETOF public.hardware_observations LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT h.* FROM public.hardware_observations h
 JOIN public.org_hardware_entitlements e ON e.org_id=h.org_id
 LEFT JOIN public.hardware_retention_state r ON r.org_id=h.org_id
 WHERE h.org_id=p_org_id AND h.tracker_id=p_tracker_id AND h.fix_valid
 AND h.recorded_at>greatest(statement_timestamp()-e.retention_days*interval '1 day',coalesce(r.purged_through,'-infinity'::timestamptz))
 ORDER BY h.recorded_at DESC,h.event_id DESC,h.device_id DESC LIMIT 1
$$;

CREATE FUNCTION public.purge_hardware_observations_preview(p_org_id uuid,p_batch_size integer DEFAULT 1000)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE cutoff timestamptz; removed integer; days integer;
BEGIN
 IF p_batch_size IS NULL OR p_batch_size NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'invalid_batch_size' USING ERRCODE='22023'; END IF;
 PERFORM gnss_private.lock_org(p_org_id);
 SELECT retention_days INTO STRICT days FROM public.org_hardware_entitlements WHERE org_id=p_org_id;
 INSERT INTO public.hardware_retention_state(org_id,purged_through) VALUES(p_org_id,clock_timestamp()-days*interval '1 day')
 ON CONFLICT(org_id) DO UPDATE SET purged_through=greatest(hardware_retention_state.purged_through,excluded.purged_through)
 RETURNING purged_through INTO cutoff;
 WITH doomed AS (SELECT device_id,event_id FROM public.hardware_observations WHERE org_id=p_org_id AND recorded_at<=cutoff ORDER BY recorded_at,device_id,event_id LIMIT p_batch_size)
 DELETE FROM public.hardware_observations h USING doomed d WHERE h.device_id=d.device_id AND h.event_id=d.event_id;
 GET DIAGNOSTICS removed=ROW_COUNT;
 RETURN jsonb_build_object('deleted',removed,'cutoff',cutoff,'has_more',EXISTS(SELECT 1 FROM public.hardware_observations WHERE org_id=p_org_id AND recorded_at<=cutoff));
END $$;
REVOKE ALL ON FUNCTION public.ingest_hardware_observation_preview(uuid,jsonb),public.hardware_latest_preview(uuid,uuid),public.purge_hardware_observations_preview(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ingest_hardware_observation_preview(uuid,jsonb),public.purge_hardware_observations_preview(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.hardware_latest_preview(uuid,uuid) TO authenticated,service_role;
COMMENT ON TABLE public.hardware_observations IS 'Simulation-only hardware observations; mobile tables untouched. Retention scheduler must be provisioned before enabling remote ingestion.';
