-- 20260208000393_preview_prereq__drop_require_owner_or_admin.sql
-- Fix: cannot change return type of existing function for _require_owner_or_admin(uuid)

DROP FUNCTION IF EXISTS public._require_owner_or_admin(uuid);