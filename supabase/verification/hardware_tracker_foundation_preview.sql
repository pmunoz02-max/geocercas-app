-- Validated in local PostgreSQL fixture. NOT run in Supabase. Disposable fixtures only.
-- Requires -v org_a=<uuid> -v org_b=<different uuid>, neither enrolled in hardware.
-- Organizations/owners must already be disposable fixtures; no users are created here.
-- All writes in this file are rolled back. ON_ERROR_STOP ends the connection on failure.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL geofield.preview_project_ref = 'mujwsfhkocsuuahlrssn';
SELECT set_config('test.hardware_org_a', :'org_a', true), set_config('test.hardware_org_b', :'org_b', true);
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
SELECT set_config('request.jwt.claim.sub', (SELECT owner_id::text FROM public.organizations WHERE id=:'org_a'::uuid), true);
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
ROLLBACK;
\echo Hardware foundation assertions completed; all fixture writes rolled back.
