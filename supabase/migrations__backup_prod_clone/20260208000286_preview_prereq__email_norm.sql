-- 20260208000286_preview_prereq__email_norm.sql
-- PREREQ canónico para desbloquear GRANTs/RLS que referencian _email_norm en 00300
-- Idempotente y bootstrap-safe.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Normaliza email para comparaciones/keys:
-- - NULL/'' => NULL
-- - trim espacios
-- - lower-case
CREATE OR REPLACE FUNCTION public._email_norm(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  IF p_email IS NULL THEN
    RETURN NULL;
  END IF;

  v := lower(btrim(p_email));

  IF v = '' THEN
    RETURN NULL;
  END IF;

  -- Si quieres además limpiar espacios internos (poco común en emails),
  -- descomenta:
  -- v := regexp_replace(v, '\s+', '', 'g');

  RETURN v;
END;
$$;

-- Permisos mínimos (00300 hará sus GRANT ALL igual; esto solo evita crash)
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._email_norm(text) TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
