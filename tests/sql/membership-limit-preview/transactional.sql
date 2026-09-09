-- DRAFT, NOT RUN. psql, isolated PREVIEW fixtures only; see README.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL READ COMMITTED;
SELECT set_config('test.org', :'org_id', true),
       set_config('test.a', :'user_a', true),
       set_config('test.b', :'user_b', true);
DO $test$
DECLARE
  o uuid := current_setting('test.org')::uuid;
  a uuid := current_setting('test.a')::uuid;
  b uuid := current_setting('test.b')::uuid;
  before_triggers text[];
BEGIN
  IF a = b OR NOT EXISTS (SELECT 1 FROM public.org_billing WHERE org_id=o)
     OR EXISTS (SELECT 1 FROM public.memberships WHERE org_id=o AND
       (user_id IN (a,b) OR (role::text='tracker' AND revoked_at IS NULL)))
     OR EXISTS (SELECT 1 FROM public.organizations WHERE id=o AND owner_id IN (a,b)) THEN
    RAISE EXCEPTION 'Dedicated empty org, billing and two non-owner users required';
  END IF;
  SELECT array_agg(pg_get_triggerdef(oid) ORDER BY tgname) INTO before_triggers
  FROM pg_trigger WHERE tgrelid='public.memberships'::regclass
    AND NOT tgisinternal AND tgname <> 'trg_enforce_membership_limit';

  UPDATE public.org_billing SET tracker_limit_override=0 WHERE org_id=o;
  BEGIN
    INSERT INTO public.memberships(org_id,user_id,role,revoked_at) VALUES(o,a,'tracker',NULL);
    RAISE EXCEPTION 'Expected zero cap rejection' USING ERRCODE='ZX001';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'Plan limit reached:%' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.org_members WHERE org_id=o AND user_id=a) THEN
    RAISE EXCEPTION 'Rejected write leaked through bridge';
  END IF;

  UPDATE public.org_billing SET tracker_limit_override=1 WHERE org_id=o;
  INSERT INTO public.memberships(org_id,user_id,role,revoked_at) VALUES(o,a,'tracker',NULL);
  -- UPDATE and UPSERT of the existing tracker at capacity must both succeed.
  UPDATE public.memberships SET role='tracker' WHERE org_id=o AND user_id=a;
  INSERT INTO public.memberships(org_id,user_id,role,revoked_at) VALUES(o,a,'tracker',NULL)
    ON CONFLICT(org_id,user_id) DO UPDATE SET role=excluded.role, revoked_at=NULL;
  INSERT INTO public.memberships(org_id,user_id,role,revoked_at) VALUES(o,b,'admin',NULL);
  BEGIN
    UPDATE public.memberships SET role='tracker' WHERE org_id=o AND user_id=b;
    RAISE EXCEPTION 'Expected role-only cap rejection' USING ERRCODE='ZX001';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'Plan limit reached:%' THEN RAISE; END IF;
  END;
  UPDATE public.memberships SET role='tracker', revoked_at=now() WHERE org_id=o AND user_id=b;
  BEGIN
    UPDATE public.memberships SET revoked_at=NULL WHERE org_id=o AND user_id=b;
    RAISE EXCEPTION 'Expected reactivation rejection' USING ERRCODE='ZX001';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'Plan limit reached:%' THEN RAISE; END IF;
  END;
  -- A revoked slot is reusable, not counted twice.
  UPDATE public.memberships SET revoked_at=now() WHERE org_id=o AND user_id=a;
  UPDATE public.memberships SET revoked_at=NULL WHERE org_id=o AND user_id=b;
  IF (SELECT count(*) FROM public.memberships WHERE org_id=o AND role::text='tracker' AND revoked_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Wrong final count';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=o AND user_id=b AND role='tracker' AND is_active)
     OR NOT EXISTS(SELECT 1 FROM public.app_user_roles WHERE org_id=o AND user_id=b AND role::text='tracker') THEN
    RAISE EXCEPTION 'Bridge not synchronized';
  END IF;
  -- Missing entitlement must not fail open. Rolled back with the outer test.
  DELETE FROM public.org_billing WHERE org_id=o;
  BEGIN
    UPDATE public.memberships SET revoked_at=NULL WHERE org_id=o AND user_id=a;
    RAISE EXCEPTION 'Expected missing entitlement rejection' USING ERRCODE='ZX001';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'membership_limit_unavailable' THEN RAISE; END IF;
  END;
  IF before_triggers IS DISTINCT FROM (SELECT array_agg(pg_get_triggerdef(oid) ORDER BY tgname)
    FROM pg_trigger WHERE tgrelid='public.memberships'::regclass AND NOT tgisinternal
    AND tgname <> 'trg_enforce_membership_limit') THEN
    RAISE EXCEPTION 'Other triggers changed';
  END IF;
  RAISE NOTICE 'Transactional assertions passed; rolling fixtures back';
END;
$test$;
ROLLBACK;
