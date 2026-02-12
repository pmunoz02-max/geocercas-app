-- 20260208000391_preview_prereq__drop_memberships_role_type.sql
-- Fix: cannot change return type of existing function for _memberships_role_type()

DROP FUNCTION IF EXISTS public._memberships_role_type();