-- 20260208000395_preview_prereq__drop_accept_invitation.sql
-- Fix: cannot change return type of existing function for accept_invitation(uuid)

DROP FUNCTION IF EXISTS public.accept_invitation(uuid);