-- Migration: Fix accept_invitation RPC to prevent role downgrade
-- Date: 2026-03-17
-- Purpose: When a user accepts an invitation to an org where they already hold a
--          higher role (owner/admin), keep their existing role instead of overwriting.
--          Complements the trg_prevent_membership_role_downgrade trigger (defense-in-depth).
-- Rules enforced:
--   - Same org: owner > admin > tracker — never downgrade
--   - Different org: invitation role applied independently (no interaction)
--   - Revoked membership: reactivated at MAX(existing_role, invite_role)

CREATE OR REPLACE FUNCTION "public"."accept_invitation"("p_token" "uuid")
RETURNS "public"."memberships"
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE
  v_inv         public.invitations;
  v_mem         public.memberships;
  v_current     public.memberships;
  v_role_apply  public.role_type;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invitation';
  END IF;

  -- Fetch any existing membership for this (org, user) pair (active or revoked)
  SELECT * INTO v_current
  FROM public.memberships
  WHERE org_id  = v_inv.org_id
    AND user_id = auth.uid()
  ORDER BY revoked_at NULLS FIRST  -- prefer active row (revoked_at IS NULL first)
  LIMIT 1;

  -- Determine the role to apply: never downgrade an existing active role
  IF v_current IS NOT NULL AND v_current.revoked_at IS NULL THEN
    -- Active membership exists: keep the higher role
    v_role_apply := CASE
      WHEN public.get_role_priority(v_current.role::TEXT) >= public.get_role_priority(v_inv.role::TEXT)
        THEN v_current.role    -- keep existing (higher or equal)
      ELSE v_inv.role          -- upgrade to invited role
    END;
  ELSIF v_current IS NOT NULL AND v_current.revoked_at IS NOT NULL THEN
    -- Revoked membership: reactivate at MAX(existing_role, invite_role)
    v_role_apply := CASE
      WHEN public.get_role_priority(v_current.role::TEXT) >= public.get_role_priority(v_inv.role::TEXT)
        THEN v_current.role
      ELSE v_inv.role
    END;
  ELSE
    -- No membership at all: use invite role directly
    v_role_apply := v_inv.role;
  END IF;

  -- Upsert membership with the computed role (trigger will block any downgrade as safety net)
  INSERT INTO public.memberships (org_id, user_id, role, is_default, revoked_at, created_at)
  VALUES (v_inv.org_id, auth.uid(), v_role_apply, FALSE, NULL, now())
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET role       = excluded.role,
        revoked_at = NULL
  RETURNING * INTO v_mem;

  -- Mark invitation as accepted
  UPDATE public.invitations
     SET status = 'accepted'
   WHERE id = v_inv.id;

  PERFORM public.log_event('invite_accepted', 'invitation', v_inv.id, to_jsonb(v_inv));

  RETURN v_mem;
END;
$$;

ALTER FUNCTION "public"."accept_invitation"("p_token" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."accept_invitation"("p_token" "uuid") IS
  'Accept a pending invitation by token.
   Rules:
   - Validates token is pending and not expired.
   - If caller already has a HIGHER or EQUAL role in the same org, keeps existing role.
   - If caller has a LOWER role (or no membership), applies the invited role.
   - Revoked memberships are reactivated with MAX(existing, invite) role.
   - Marks the invitation as accepted.
   
   Downgrade prevention is enforced at two layers:
   1. This function (pre-computed role selection)
   2. trg_prevent_membership_role_downgrade trigger (defense-in-depth)';
