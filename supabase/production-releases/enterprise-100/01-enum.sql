-- Target ONLY wpaixkvokdkudymgjoua (Production), explicitly authorized.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TYPE public.plan_code ADD VALUE IF NOT EXISTS 'enterprise_100';
COMMIT;
