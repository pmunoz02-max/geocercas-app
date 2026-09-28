-- DRAFT / NOT APPLIED. Preview mujwsfhkocsuuahlrssn only.
-- Run atomically, only after verifying the connection/project independently.
-- The explicit session marker is an operator interlock, NOT project authentication.
DO $$
BEGIN
  IF current_setting('geofield.preview_project_ref', true) IS DISTINCT FROM 'mujwsfhkocsuuahlrssn' THEN
    RAISE EXCEPTION 'hardware_preview_target_confirmation_required';
  END IF;
END $$;

CREATE SCHEMA gnss_private;
REVOKE ALL ON SCHEMA gnss_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.org_hardware_entitlements (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  max_hardware_trackers integer NOT NULL DEFAULT 0 CHECK (max_hardware_trackers >= 0),
  retention_days integer NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 365),
  simulation_only boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Hardware logical identities only in phase 1; no mobile backfill or fake users.
CREATE TABLE public.trackers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.org_hardware_entitlements(org_id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  asset_kind text NOT NULL CHECK (asset_kind IN ('person', 'vehicle', 'equipment')),
  active boolean NOT NULL DEFAULT false,
  is_simulated boolean NOT NULL DEFAULT true,
  retention_mode text NOT NULL DEFAULT 'full_route' CHECK (retention_mode IN ('full_route','inside_only')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (org_id, id)
);
CREATE INDEX trackers_active_org_idx ON public.trackers(org_id) WHERE active;

CREATE TABLE public.tracker_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.org_hardware_entitlements(org_id) ON DELETE RESTRICT,
  manufacturer text NOT NULL CHECK (length(btrim(manufacturer)) BETWEEN 1 AND 80),
  model text NOT NULL CHECK (length(btrim(model)) BETWEEN 1 AND 80),
  protocol text NOT NULL CHECK (length(btrim(protocol)) BETWEEN 1 AND 80),
  identifier_kind text NOT NULL CHECK (identifier_kind IN ('simulator','imei','serial')),
  external_id text NOT NULL CHECK (length(btrim(external_id)) BETWEEN 1 AND 128 AND external_id = lower(btrim(external_id))),
  is_simulated boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (org_id, id),
  UNIQUE (identifier_kind, external_id),
  CHECK ((identifier_kind = 'simulator') = is_simulated),
  CHECK (identifier_kind <> 'imei' OR external_id ~ '^[0-9]{15}$')
);

CREATE TABLE public.tracker_device_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  tracker_id uuid NOT NULL,
  device_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz,
  FOREIGN KEY (org_id, tracker_id) REFERENCES public.trackers(org_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, device_id) REFERENCES public.tracker_devices(org_id,id) ON DELETE RESTRICT,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX tracker_one_open_device ON public.tracker_device_bindings(tracker_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX device_one_open_tracker ON public.tracker_device_bindings(device_id) WHERE ended_at IS NULL;
CREATE INDEX binding_tracker_history ON public.tracker_device_bindings(org_id,tracker_id,started_at);
CREATE INDEX binding_device_history ON public.tracker_device_bindings(org_id,device_id,started_at);

CREATE FUNCTION gnss_private.lock_org(p_org uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF current_setting('transaction_isolation') NOT IN ('read committed','read uncommitted') THEN
    RAISE EXCEPTION 'hardware_requires_read_committed' USING ERRCODE='25001';
  END IF;
  -- Same parent-row lock as enforce_membership_limit; compatible with FK KEY SHARE.
  PERFORM 1 FROM public.organizations WHERE id=p_org FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hardware_org_not_found' USING ERRCODE='23503';
  END IF;
END $$;

CREATE FUNCTION gnss_private.guard_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'hardware_org_immutable' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME <> 'org_hardware_entitlements' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.is_simulated IS DISTINCT FROM OLD.is_simulated THEN
      RAISE EXCEPTION 'hardware_identity_immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'tracker_devices' THEN
    IF NEW.external_id IS DISTINCT FROM OLD.external_id
       OR NEW.identifier_kind IS DISTINCT FROM OLD.identifier_kind
       OR NEW.protocol IS DISTINCT FROM OLD.protocol THEN
      RAISE EXCEPTION 'hardware_device_identity_immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION gnss_private.check_capacity() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cfg public.org_hardware_entitlements%ROWTYPE;
  used_count bigint;
BEGIN
  PERFORM gnss_private.lock_org(NEW.org_id);
  SELECT * INTO STRICT cfg FROM public.org_hardware_entitlements WHERE org_id=NEW.org_id;
  -- Separate query after lock, fresh READ COMMITTED snapshot, AFTER actual upsert.
  SELECT count(*) INTO used_count FROM public.trackers WHERE org_id=NEW.org_id AND active;
  IF used_count > cfg.max_hardware_trackers OR (NOT cfg.enabled AND used_count > 0) THEN
    RAISE EXCEPTION 'hardware_limit_reached' USING ERRCODE='23514';
  END IF;
  IF cfg.simulation_only AND (
    EXISTS (SELECT 1 FROM public.trackers WHERE org_id=NEW.org_id AND active AND NOT is_simulated)
    OR EXISTS (SELECT 1 FROM public.tracker_devices WHERE org_id=NEW.org_id AND active AND NOT is_simulated)
  ) THEN
    RAISE EXCEPTION 'hardware_simulation_only' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME = 'trackers' THEN
    IF NOT NEW.active THEN
      UPDATE public.tracker_device_bindings SET ended_at=clock_timestamp()
      WHERE org_id=NEW.org_id AND tracker_id=NEW.id AND ended_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION gnss_private.check_device() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM gnss_private.lock_org(NEW.org_id);
  IF NEW.active AND NOT NEW.is_simulated AND EXISTS (
    SELECT 1 FROM public.org_hardware_entitlements WHERE org_id=NEW.org_id AND simulation_only
  ) THEN
    RAISE EXCEPTION 'hardware_simulation_only' USING ERRCODE='23514';
  END IF;
  IF NOT NEW.active THEN
    UPDATE public.tracker_device_bindings SET ended_at=clock_timestamp()
    WHERE org_id=NEW.org_id AND device_id=NEW.id AND ended_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION gnss_private.guard_binding() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.trackers%ROWTYPE;
  d public.tracker_devices%ROWTYPE;
BEGIN
  PERFORM gnss_private.lock_org(NEW.org_id);
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id
       OR NEW.tracker_id IS DISTINCT FROM OLD.tracker_id OR NEW.device_id IS DISTINCT FROM OLD.device_id
       OR NEW.started_at IS DISTINCT FROM OLD.started_at OR OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
      RAISE EXCEPTION 'hardware_binding_history_immutable' USING ERRCODE='23514';
    END IF;
    NEW.ended_at := clock_timestamp();
    RETURN NEW;
  END IF;
  IF NEW.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'hardware_binding_must_start_open' USING ERRCODE='23514';
  END IF;
  SELECT * INTO t FROM public.trackers WHERE org_id=NEW.org_id AND id=NEW.tracker_id;
  SELECT * INTO d FROM public.tracker_devices WHERE org_id=NEW.org_id AND id=NEW.device_id;
  IF t.id IS NULL OR d.id IS NULL THEN
    RAISE EXCEPTION 'hardware_binding_org_mismatch' USING ERRCODE='23503';
  END IF;
  IF NOT t.active OR NOT d.active OR t.is_simulated <> d.is_simulated OR NOT EXISTS (
    SELECT 1 FROM public.org_hardware_entitlements WHERE org_id=NEW.org_id AND enabled
  ) THEN
    RAISE EXCEPTION 'hardware_binding_not_enabled' USING ERRCODE='23514';
  END IF;
  -- No historical import / moving bindings in this first phase.
  NEW.started_at := clock_timestamp();
  -- Defend against clock regression and preserve non-overlapping closed history.
  IF EXISTS (SELECT 1 FROM public.tracker_device_bindings
      WHERE (device_id=NEW.device_id OR tracker_id=NEW.tracker_id) AND ended_at > NEW.started_at) THEN
    RAISE EXCEPTION 'hardware_binding_clock_regression' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER hardware_entitlement_identity BEFORE UPDATE ON public.org_hardware_entitlements
FOR EACH ROW EXECUTE FUNCTION gnss_private.guard_identity();
CREATE TRIGGER hardware_entitlement_capacity AFTER INSERT OR UPDATE ON public.org_hardware_entitlements
FOR EACH ROW EXECUTE FUNCTION gnss_private.check_capacity();
CREATE TRIGGER hardware_tracker_identity BEFORE UPDATE ON public.trackers
FOR EACH ROW EXECUTE FUNCTION gnss_private.guard_identity();
CREATE TRIGGER hardware_tracker_capacity AFTER INSERT OR UPDATE ON public.trackers
FOR EACH ROW EXECUTE FUNCTION gnss_private.check_capacity();
CREATE TRIGGER hardware_device_identity BEFORE UPDATE ON public.tracker_devices
FOR EACH ROW EXECUTE FUNCTION gnss_private.guard_identity();
CREATE TRIGGER hardware_device_state AFTER INSERT OR UPDATE ON public.tracker_devices
FOR EACH ROW EXECUTE FUNCTION gnss_private.check_device();
CREATE TRIGGER hardware_binding_guard BEFORE INSERT OR UPDATE ON public.tracker_device_bindings
FOR EACH ROW EXECUTE FUNCTION gnss_private.guard_binding();

ALTER TABLE public.org_hardware_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trackers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_device_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_hardware_entitlements, public.trackers, public.tracker_devices,
  public.tracker_device_bindings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.org_hardware_entitlements, public.trackers, public.tracker_devices,
  public.tracker_device_bindings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.org_hardware_entitlements, public.trackers,
  public.tracker_devices, public.tracker_device_bindings TO service_role;
-- No DELETE/TRUNCATE: disable/close to retain history. No user writes in phase 1.
CREATE POLICY hardware_entitlements_admin_read ON public.org_hardware_entitlements FOR SELECT TO authenticated
USING (public.has_org_role_active(org_id, ARRAY['owner','admin']::text[]));
CREATE POLICY hardware_trackers_admin_read ON public.trackers FOR SELECT TO authenticated
USING (public.has_org_role_active(org_id, ARRAY['owner','admin']::text[]));
CREATE POLICY hardware_devices_admin_read ON public.tracker_devices FOR SELECT TO authenticated
USING (public.has_org_role_active(org_id, ARRAY['owner','admin']::text[]));
CREATE POLICY hardware_bindings_admin_read ON public.tracker_device_bindings FOR SELECT TO authenticated
USING (public.has_org_role_active(org_id, ARRAY['owner','admin']::text[]));
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gnss_private FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.org_hardware_entitlements IS
'Hardware pilot configuration. No row means disabled. Set explicit pilot org to 2/30/simulation_only via separately reviewed provisioning. Retention worker is not implemented here.';
COMMENT ON TABLE public.trackers IS
'Hardware logical identities, independent from auth users. No mobile migration in phase 1.';
COMMENT ON TABLE public.tracker_device_bindings IS
'Append/close history, [started_at, ended_at). No cross-org transfer or backdating in phase 1.';
-- No organization is enabled or seeded. No changes to legacy tables/functions.
