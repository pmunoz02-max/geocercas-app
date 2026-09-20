-- PREVIEW ONLY: mujwsfhkocsuuahlrssn. Commit before catalog migration.
DO $guard$ BEGIN
 IF current_setting('app.env', true) IS DISTINCT FROM 'preview' THEN
  RAISE EXCEPTION 'Preview migration refused in production';
 END IF;
END $guard$;
ALTER TYPE public.plan_code ADD VALUE IF NOT EXISTS 'enterprise_100' AFTER 'enterprise';

