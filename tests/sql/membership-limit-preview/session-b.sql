-- Start while A is paused. Do not run sequentially after A.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='60s';
SELECT set_config('test.org', :'org_id', true), set_config('test.b', :'user_b', true);
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.memberships(org_id,user_id,role,revoked_at)
    VALUES(current_setting('test.org')::uuid,current_setting('test.b')::uuid,'tracker',NULL);
    RAISE EXCEPTION 'Both competitors accepted: concurrency guard failed' USING ERRCODE='ZX001';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'Plan limit reached:%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.memberships WHERE org_id=current_setting('test.org')::uuid
      AND role::text='tracker' AND revoked_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one committed tracker';
  END IF;
  IF EXISTS(SELECT 1 FROM public.org_members WHERE org_id=current_setting('test.org')::uuid
      AND user_id=current_setting('test.b')::uuid) THEN
    RAISE EXCEPTION 'Losing session leaked projected membership';
  END IF;
  RAISE NOTICE 'B rejected after A committed; exactly one slot consumed';
END;
$test$;
ROLLBACK;
