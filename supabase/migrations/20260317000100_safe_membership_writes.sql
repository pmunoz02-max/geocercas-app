-- Migration: Safe Membership Writes
-- Date: 2026-03-17
-- Purpose: Replace unsafe direct deletes with safe soft-delete using revoked_at
-- Replaces existing remove_member and set_member_role RPCs to prevent role downgrades

-- 1) Update remove_member RPC to use safe revocation pattern (revoked_at)
CREATE OR REPLACE FUNCTION "public"."remove_member"("p_org" "uuid", "p_user" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = 'public'
    AS $$
BEGIN
  IF NOT public.has_role(p_org, 'admin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Soft-delete: revoke active memberships by setting revoked_at
  UPDATE public.memberships
  SET revoked_at = NOW()
  WHERE org_id = p_org 
    AND user_id = p_user 
    AND revoked_at IS NULL;
END;
$$;

ALTER FUNCTION "public"."remove_member"("p_org" "uuid", "p_user" "uuid") OWNER TO "postgres";

-- 2) Update set_member_role RPC to prevent role downgrades (role precedence logic)
-- Role hierarchy: owner(3) > admin(2) > tracker(1)
CREATE OR REPLACE FUNCTION "public"."set_member_role"("p_org" "uuid", "p_user" "uuid", "p_role" "public"."role_type") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = 'public'
    AS $$
DECLARE
  v_current_role TEXT;
  v_new_role TEXT;
  v_current_priority INT;
  v_new_priority INT;
BEGIN
  IF NOT public.has_role(p_org, 'admin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Get current role
  SELECT role INTO v_current_role
  FROM public.memberships
  WHERE org_id = p_org AND user_id = p_user AND revoked_at IS NULL
  LIMIT 1;

  IF v_current_role IS NULL THEN
    -- No active membership - insert as lowest priority to avoid unwarranted privilege escalation
    INSERT INTO public.memberships (org_id, user_id, role, is_default, revoked_at)
    VALUES (p_org, p_user, p_role, FALSE, NULL);
    RETURN;
  END IF;

  -- Role priority: owner > admin > tracker
  v_current_priority := CASE v_current_role
    WHEN 'owner' THEN 3
    WHEN 'admin' THEN 2
    WHEN 'tracker' THEN 1
    ELSE 1
  END;

  v_new_priority := CASE p_role
    WHEN 'owner' THEN 3
    WHEN 'admin' THEN 2
    WHEN 'tracker' THEN 1
    ELSE 1
  END;

  -- Only allow upgrade, never downgrade
  IF v_new_priority > v_current_priority THEN
    UPDATE public.memberships
    SET role = p_role, is_default = TRUE
    WHERE org_id = p_org AND user_id = p_user AND revoked_at IS NULL;
  END IF;
  -- If new_priority <= current_priority, do nothing (keep existing role)
END;
$$;

ALTER FUNCTION "public"."set_member_role"("p_org" "uuid", "p_user" "uuid", "p_role" "public"."role_type") OWNER TO "postgres";
