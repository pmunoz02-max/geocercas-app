-- Generated rollback-only integration test, Supabase Preview mujwsfhkocsuuahlrssn.
-- No COMMIT. Includes exact reviewed migration SHA256 2ff7fb89ee4e595477f2e0f8e91f8104a77190db4e6db29e5a27dc135400b470.
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
SET LOCAL idle_in_transaction_session_timeout='45s';
SET LOCAL application_name='hardware_foundation_preview_rollback';
SET LOCAL geofield.preview_project_ref='mujwsfhkocsuuahlrssn';
SELECT set_config('request.jwt.claim.sub','',true);
DO $preflight$
BEGIN
 IF to_regnamespace('gnss_private') IS NOT NULL OR to_regclass('public.trackers') IS NOT NULL
 OR to_regclass('public.tracker_devices') IS NOT NULL OR to_regclass('public.tracker_device_bindings') IS NOT NULL
 OR to_regclass('public.org_hardware_entitlements') IS NOT NULL THEN
   RAISE EXCEPTION 'hardware_objects_already_exist';
 END IF;
 IF EXISTS (SELECT 1 FROM auth.users WHERE id IN ('ab0a691c-02f5-47b2-adac-41b6e6a2cf55','3f4fb852-9053-44da-ab40-5a25f4799453','b61c5402-fd3a-46b5-a71e-79eda9e1fa42'))
 OR EXISTS (SELECT 1 FROM public.organizations WHERE id IN ('5ffdc975-be88-4d2d-826e-950339f3c46a','73aaf59b-b818-4c28-946e-e01ea9a65a7b')) THEN
   RAISE EXCEPTION 'fixture_id_collision';
 END IF;
END $preflight$;
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


-- All fixture records are created here, invisible outside this transaction.
INSERT INTO auth.users(id) VALUES('ab0a691c-02f5-47b2-adac-41b6e6a2cf55'),('3f4fb852-9053-44da-ab40-5a25f4799453'),('b61c5402-fd3a-46b5-a71e-79eda9e1fa42');
INSERT INTO public.organizations(id,name,owner_id) VALUES
 ('5ffdc975-be88-4d2d-826e-950339f3c46a','SIM hardware rollback A','ab0a691c-02f5-47b2-adac-41b6e6a2cf55'),
 ('73aaf59b-b818-4c28-946e-e01ea9a65a7b','SIM hardware rollback B','3f4fb852-9053-44da-ab40-5a25f4799453');
INSERT INTO public.memberships(org_id,user_id,role) VALUES
 ('5ffdc975-be88-4d2d-826e-950339f3c46a','ab0a691c-02f5-47b2-adac-41b6e6a2cf55','owner'),('73aaf59b-b818-4c28-946e-e01ea9a65a7b','3f4fb852-9053-44da-ab40-5a25f4799453','owner'),('73aaf59b-b818-4c28-946e-e01ea9a65a7b','b61c5402-fd3a-46b5-a71e-79eda9e1fa42','admin');

-- Validated in local PostgreSQL fixture. NOT run in Supabase. Disposable fixtures only.
-- Requires -v org_a=<uuid> -v org_b=<different uuid>, neither enrolled in hardware.
-- Organizations/owners must already be disposable fixtures; no users are created here.
-- All writes in this file are rolled back. ON_ERROR_STOP ends the connection on failure.
SET LOCAL geofield.preview_project_ref = 'mujwsfhkocsuuahlrssn';
SELECT set_config('test.hardware_org_a', '5ffdc975-be88-4d2d-826e-950339f3c46a', true), set_config('test.hardware_org_b', '73aaf59b-b818-4c28-946e-e01ea9a65a7b', true);
CREATE FUNCTION pg_temp.expect_state(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE;
  END;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Expected SQLSTATE %, got % for %', expected, coalesce(actual,'success'), statement;
  END IF;
END $$;

DO $$
DECLARE
  a uuid := current_setting('test.hardware_org_a')::uuid;
  b uuid := current_setting('test.hardware_org_b')::uuid;
  t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid();
  d1 uuid := gen_random_uuid(); d2 uuid := gen_random_uuid(); db uuid := gen_random_uuid();
  binding_id uuid; memberships_before bigint;
BEGIN
  IF a=b OR (SELECT count(*) FROM public.organizations WHERE id IN (a,b)) <> 2 THEN
    RAISE EXCEPTION 'Two distinct disposable organizations required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.org_hardware_entitlements WHERE org_id IN (a,b)) THEN
    RAISE EXCEPTION 'Fixtures must not already have hardware entitlements';
  END IF;
  SELECT count(*) INTO memberships_before FROM public.memberships WHERE org_id IN (a,b);
  INSERT INTO public.org_hardware_entitlements(org_id,enabled,max_hardware_trackers) VALUES(a,true,0),(b,true,2);
  PERFORM pg_temp.expect_state(format('INSERT INTO public.trackers(org_id,name,asset_kind,active) VALUES(%L,''denied'',''vehicle'',true)',a),'23514');
  PERFORM pg_temp.expect_state(format('UPDATE public.org_hardware_entitlements SET max_hardware_trackers=-1 WHERE org_id=%L',a),'23514');
  PERFORM pg_temp.expect_state(format('UPDATE public.org_hardware_entitlements SET max_hardware_trackers=NULL WHERE org_id=%L',a),'23502');
  PERFORM pg_temp.expect_state(format('UPDATE public.org_hardware_entitlements SET retention_days=0 WHERE org_id=%L',a),'23514');
  UPDATE public.org_hardware_entitlements SET max_hardware_trackers=1 WHERE org_id=a;
  INSERT INTO public.trackers(id,org_id,name,asset_kind,active) VALUES(t1,a,'SIM A','vehicle',true);
  -- Idempotent update/upsert does not consume a second slot.
  INSERT INTO public.trackers(id,org_id,name,asset_kind,active) VALUES(t1,a,'SIM A','vehicle',true)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name;
  UPDATE public.trackers SET active=true WHERE id=t1;
  PERFORM pg_temp.expect_state(format('INSERT INTO public.trackers(org_id,name,asset_kind,active) VALUES(%L,''denied'',''vehicle'',true)',a),'23514');
  PERFORM pg_temp.expect_state(format('UPDATE public.org_hardware_entitlements SET max_hardware_trackers=0 WHERE org_id=%L',a),'23514');
  PERFORM pg_temp.expect_state(format('UPDATE public.org_hardware_entitlements SET enabled=false WHERE org_id=%L',a),'23514');
  UPDATE public.org_hardware_entitlements SET max_hardware_trackers=2 WHERE org_id=a;
  INSERT INTO public.trackers(id,org_id,name,asset_kind,active) VALUES(t2,a,'SIM B','equipment',true);
  PERFORM pg_temp.expect_state(format('INSERT INTO public.trackers(org_id,name,asset_kind,active) VALUES(%L,''third denied'',''vehicle'',true)',a),'23514');
  PERFORM pg_temp.expect_state(format('UPDATE public.trackers SET org_id=%L WHERE id=%L',b,t1),'23514');
  PERFORM pg_temp.expect_state(format('INSERT INTO public.tracker_devices(org_id,manufacturer,model,protocol,identifier_kind,external_id,is_simulated) VALUES(%L,''test'',''test'',''unverified'',''imei'',''123456789012345'',false)',a),'23514');
  INSERT INTO public.tracker_devices(id,org_id,manufacturer,model,protocol,identifier_kind,external_id)
    VALUES(d1,a,'simulator','fixture','normalized-simulator-v1','simulator',d1::text),
          (d2,a,'simulator','fixture','normalized-simulator-v1','simulator',d2::text),
          (db,b,'simulator','fixture','normalized-simulator-v1','simulator',db::text);
  INSERT INTO public.tracker_device_bindings(org_id,tracker_id,device_id) VALUES(a,t1,d1) RETURNING id INTO binding_id;
  PERFORM pg_temp.expect_state(format('INSERT INTO public.tracker_device_bindings(org_id,tracker_id,device_id) VALUES(%L,%L,%L)',a,t2,d1),'23505');
  PERFORM pg_temp.expect_state(format('INSERT INTO public.tracker_device_bindings(org_id,tracker_id,device_id) VALUES(%L,%L,%L)',a,t1,d2),'23505');
  PERFORM pg_temp.expect_state(format('INSERT INTO public.tracker_device_bindings(org_id,tracker_id,device_id) VALUES(%L,%L,%L)',a,t2,db),'23503');
  -- Replacement closes the old period and opens a new one; no extra tracker.
  UPDATE public.tracker_device_bindings SET ended_at=clock_timestamp() WHERE id=binding_id;
  INSERT INTO public.tracker_device_bindings(org_id,tracker_id,device_id) VALUES(a,t1,d2);
  PERFORM pg_temp.expect_state(format('UPDATE public.tracker_device_bindings SET ended_at=NULL WHERE id=%L',binding_id),'23514');
  IF (SELECT count(*) FROM public.trackers WHERE org_id=a AND active) <> 2 THEN RAISE EXCEPTION 'Wrong slot count'; END IF;
  UPDATE public.trackers SET active=false WHERE id=t1;
  IF EXISTS (SELECT 1 FROM public.tracker_device_bindings WHERE tracker_id=t1 AND ended_at IS NULL) THEN RAISE EXCEPTION 'Binding still open'; END IF;
  UPDATE public.org_hardware_entitlements SET max_hardware_trackers=1 WHERE org_id=a;
  PERFORM pg_temp.expect_state(format('UPDATE public.trackers SET active=true WHERE id=%L',t1),'23514');
  UPDATE public.trackers SET active=false WHERE id=t2;
  UPDATE public.trackers SET active=true WHERE id=t1;
  INSERT INTO public.tracker_device_bindings(org_id,tracker_id,device_id) VALUES(a,t1,d2);
  UPDATE public.tracker_devices SET active=false WHERE id=d2;
  IF EXISTS (SELECT 1 FROM public.tracker_device_bindings WHERE device_id=d2 AND ended_at IS NULL) THEN RAISE EXCEPTION 'Disabled device still bound'; END IF;
  IF (SELECT count(*) FROM public.trackers WHERE org_id=a AND active) <> 1 THEN RAISE EXCEPTION 'Device disabling incorrectly freed slot'; END IF;
  IF (SELECT count(*) FROM public.memberships WHERE org_id IN (a,b)) <> memberships_before THEN RAISE EXCEPTION 'Memberships changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.org_hardware_entitlements WHERE org_id=a AND retention_days=30 AND simulation_only) THEN RAISE EXCEPTION 'Pilot defaults incorrect'; END IF;
END $$;

-- RLS: use only the owner of the disposable fixture, never a real user's session.
SELECT set_config('request.jwt.claim.sub', (SELECT owner_id::text FROM public.organizations WHERE id='5ffdc975-be88-4d2d-826e-950339f3c46a'::uuid), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.org_hardware_entitlements WHERE org_id=current_setting('test.hardware_org_a')::uuid) <> 1 THEN RAISE EXCEPTION 'Fixture owner cannot read own config'; END IF;
  IF EXISTS (SELECT 1 FROM public.org_hardware_entitlements WHERE org_id=current_setting('test.hardware_org_b')::uuid) THEN RAISE EXCEPTION 'Cross-org read'; END IF;
  BEGIN
    INSERT INTO public.trackers(org_id,name,asset_kind) VALUES(current_setting('test.hardware_org_a')::uuid,'forbidden','vehicle');
    RAISE EXCEPTION 'User write unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.trackers;
    RAISE EXCEPTION 'Anonymous read unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
-- Check all new objects, including backend cannot truncate/delete history.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['org_hardware_entitlements','trackers','tracker_devices','tracker_device_bindings'] LOOP
    IF has_table_privilege('service_role','public.'||tbl,'DELETE') OR has_table_privilege('service_role','public.'||tbl,'TRUNCATE') THEN RAISE EXCEPTION 'Destructive grant on %',tbl; END IF;
    IF NOT has_table_privilege('service_role','public.'||tbl,'INSERT') THEN RAISE EXCEPTION 'Missing backend grant'; END IF;
  END LOOP;
END $$;


-- Backend execution on actual service_role.
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
DO $backend$
DECLARE t uuid; d uuid:=gen_random_uuid();
BEGIN
 INSERT INTO public.trackers(org_id,name,asset_kind,active)
 VALUES('73aaf59b-b818-4c28-946e-e01ea9a65a7b','SIM backend rollback','vehicle',true) RETURNING id INTO t;
 INSERT INTO public.tracker_devices(id,org_id,manufacturer,model,protocol,identifier_kind,external_id)
 VALUES(d,'73aaf59b-b818-4c28-946e-e01ea9a65a7b','simulator','fixture','normalized-simulator-v1','simulator',d::text);
 INSERT INTO public.tracker_device_bindings(org_id,tracker_id,device_id) VALUES('73aaf59b-b818-4c28-946e-e01ea9a65a7b',t,d);
END $backend$;
RESET ROLE;

-- The admin sees only its own org and then loses all four reads on revocation.
SELECT set_config('request.jwt.claim.sub','b61c5402-fd3a-46b5-a71e-79eda9e1fa42',true);
SET LOCAL ROLE authenticated;
DO $visible$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.org_hardware_entitlements WHERE org_id='73aaf59b-b818-4c28-946e-e01ea9a65a7b')
 OR NOT EXISTS(SELECT 1 FROM public.trackers WHERE org_id='73aaf59b-b818-4c28-946e-e01ea9a65a7b')
 OR NOT EXISTS(SELECT 1 FROM public.tracker_devices WHERE org_id='73aaf59b-b818-4c28-946e-e01ea9a65a7b')
 OR NOT EXISTS(SELECT 1 FROM public.tracker_device_bindings WHERE org_id='73aaf59b-b818-4c28-946e-e01ea9a65a7b') THEN
   RAISE EXCEPTION 'active_admin_read_failed';
 END IF;
 IF EXISTS(SELECT 1 FROM public.org_hardware_entitlements WHERE org_id='5ffdc975-be88-4d2d-826e-950339f3c46a')
 OR EXISTS(SELECT 1 FROM public.trackers WHERE org_id='5ffdc975-be88-4d2d-826e-950339f3c46a')
 OR EXISTS(SELECT 1 FROM public.tracker_devices WHERE org_id='5ffdc975-be88-4d2d-826e-950339f3c46a')
 OR EXISTS(SELECT 1 FROM public.tracker_device_bindings WHERE org_id='5ffdc975-be88-4d2d-826e-950339f3c46a') THEN
   RAISE EXCEPTION 'cross_org_read';
 END IF;
END $visible$;
RESET ROLE;
UPDATE public.memberships SET revoked_at=clock_timestamp() WHERE org_id='73aaf59b-b818-4c28-946e-e01ea9a65a7b' AND user_id='b61c5402-fd3a-46b5-a71e-79eda9e1fa42';
SET LOCAL ROLE authenticated;
DO $revoked$
BEGIN
 IF EXISTS(SELECT 1 FROM public.org_hardware_entitlements)
 OR EXISTS(SELECT 1 FROM public.trackers)
 OR EXISTS(SELECT 1 FROM public.tracker_devices)
 OR EXISTS(SELECT 1 FROM public.tracker_device_bindings) THEN
   RAISE EXCEPTION 'revoked_admin_still_reads_hardware';
 END IF;
END $revoked$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
-- The real owner-integrity trigger must remain effective.
SELECT pg_temp.expect_state(
 'UPDATE public.memberships SET revoked_at=clock_timestamp() WHERE org_id=''5ffdc975-be88-4d2d-826e-950339f3c46a'' AND user_id=''ab0a691c-02f5-47b2-adac-41b6e6a2cf55''',
 '23514'
);
DO $bridges$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.memberships WHERE org_id='5ffdc975-be88-4d2d-826e-950339f3c46a' AND user_id='ab0a691c-02f5-47b2-adac-41b6e6a2cf55' AND role::text='owner' AND revoked_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id='5ffdc975-be88-4d2d-826e-950339f3c46a' AND user_id='ab0a691c-02f5-47b2-adac-41b6e6a2cf55' AND role='owner' AND is_active)
 OR NOT EXISTS(SELECT 1 FROM public.app_user_roles WHERE org_id='5ffdc975-be88-4d2d-826e-950339f3c46a' AND user_id='ab0a691c-02f5-47b2-adac-41b6e6a2cf55' AND role='owner')
 OR NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id='73aaf59b-b818-4c28-946e-e01ea9a65a7b' AND user_id='b61c5402-fd3a-46b5-a71e-79eda9e1fa42' AND NOT is_active)
 OR EXISTS(SELECT 1 FROM public.app_user_roles WHERE org_id='73aaf59b-b818-4c28-946e-e01ea9a65a7b' AND user_id='b61c5402-fd3a-46b5-a71e-79eda9e1fa42') THEN
   RAISE EXCEPTION 'legacy_owner_or_revocation_bridge_changed';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.org_billing WHERE org_id='5ffdc975-be88-4d2d-826e-950339f3c46a' AND plan_code='free')
 OR NOT EXISTS(SELECT 1 FROM public.org_billing WHERE org_id='73aaf59b-b818-4c28-946e-e01ea9a65a7b' AND plan_code='free') THEN
   RAISE EXCEPTION 'fixture_free_billing_missing';
 END IF;
END $bridges$;
ROLLBACK;
-- Returned only after successful assertions and rollback.
SELECT jsonb_build_object(
 'result','PASS','project','mujwsfhkocsuuahlrssn','rollback_completed',true,
 'migration_sha256','2ff7fb89ee4e595477f2e0f8e91f8104a77190db4e6db29e5a27dc135400b470',
 'hardware_objects_absent',to_regclass('public.trackers') IS NULL
   AND to_regclass('public.tracker_devices') IS NULL AND to_regclass('public.tracker_device_bindings') IS NULL
   AND to_regclass('public.org_hardware_entitlements') IS NULL AND to_regnamespace('gnss_private') IS NULL,
 'fixture_users_absent',NOT EXISTS(SELECT 1 FROM auth.users WHERE id IN ('ab0a691c-02f5-47b2-adac-41b6e6a2cf55','3f4fb852-9053-44da-ab40-5a25f4799453','b61c5402-fd3a-46b5-a71e-79eda9e1fa42')),
 'fixture_orgs_absent',NOT EXISTS(SELECT 1 FROM public.organizations WHERE id IN ('5ffdc975-be88-4d2d-826e-950339f3c46a','73aaf59b-b818-4c28-946e-e01ea9a65a7b'))
) AS validation;
