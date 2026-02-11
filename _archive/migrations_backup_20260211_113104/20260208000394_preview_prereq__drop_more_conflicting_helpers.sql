-- 20260208000394_preview_prereq__drop_more_conflicting_helpers.sql
-- Batch drops para evitar: cannot change return type of existing function (42P13)
-- Debe ejecutarse ANTES de 20260208000400_preview_vft.sql

DROP FUNCTION IF EXISTS public._set_current_org_for_user(uuid, uuid);
DROP FUNCTION IF EXISTS public._require_owner_or_admin(uuid);