-- 20260208000392_preview_prereq__drop_org_members_enforce_is_active_for_admins.sql
-- Fix: cannot change return type of existing function for _org_members_enforce_is_active_for_admins()

DROP FUNCTION IF EXISTS public._org_members_enforce_is_active_for_admins();