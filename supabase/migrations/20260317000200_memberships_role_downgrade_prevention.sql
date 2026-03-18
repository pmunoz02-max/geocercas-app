-- Migration: Memberships Role Downgrade Prevention
-- Date: 2026-03-17
-- Purpose: Add DB-level protection against accidental role downgrades in memberships
-- Scope: Defense in depth - complements runtime RPC checks
-- Author: Database Hardening Proposal
-- 
-- This is the PROPOSED SQL. DO NOT APPLY without explicit approval.
-- Review: docs/DATABASE_HARDENING_MEMBERSHIPS_PROPOSAL.md for full context.

-- ============================================================================
-- 1. HELPER FUNCTION: Map role_type to numeric priority
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_role_priority(p_role TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN 3
    WHEN 'admin' THEN 2
    WHEN 'tracker' THEN 1
    WHEN 'viewer' THEN 0
    ELSE 0
  END;
$$;

COMMENT ON FUNCTION public.get_role_priority(TEXT) IS
  'Map role_type to numeric priority for downgrade prevention.
   owner=3 (highest), admin=2, tracker=1, viewer=0 (lowest).
   Used by: prevent_membership_role_downgrade() trigger.';

ALTER FUNCTION public.get_role_priority(TEXT) OWNER TO "postgres";


-- ============================================================================
-- 2. TRIGGER FUNCTION: Prevent role downgrades in memberships
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_membership_role_downgrade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_priority INT;
  v_new_priority INT;
BEGIN
  -- Trigger only fires on UPDATE OF role and revoked_at (see trigger definition)
  -- Double-check: skip if role didn't change
  IF OLD.role = NEW.role THEN
    RETURN NEW;
  END IF;

  -- Allow soft-delete: if revoked_at transitions from NULL -> non-NULL, allow it
  -- This is the legitimate way to remove elevated privileges
  IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get priority for old and new roles
  v_old_priority := public.get_role_priority(OLD.role::TEXT);
  v_new_priority := public.get_role_priority(NEW.role::TEXT);

  -- BLOCK downgrade: if new priority < old priority, reject
  IF v_new_priority < v_old_priority THEN
    RAISE EXCEPTION
      'Membership role downgrade blocked: cannot downgrade % -> % in org % for user %',
      OLD.role::TEXT, 
      NEW.role::TEXT, 
      OLD.org_id::TEXT, 
      OLD.user_id::TEXT
      USING ERRCODE = 'P0001',
            HINT = 'To demote: use remove_member() to revoke, then re-invite at lower role. '
                   'Or contact admin if this is intentional escalation.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_membership_role_downgrade() IS
  'Trigger function: Prevents accidental role downgrades within same org.
   
   ALLOWS:
   - Role upgrades: tracker->admin->owner
   - Lateral moves: admin->admin (side effects if roles evolve)
   - Soft-delete: any role + revoked_at=NOW()
   - Multi-org roles: different orgs have independent rows
   
   BLOCKS:
   - owner->admin, owner->tracker, admin->tracker in same org
   - Any downgrade of role priority in same (org_id, user_id) row
   
   Complements set_member_role() RPC which already prevents downgrades.
   This adds defense-in-depth against direct SQL or buggy clients.';

ALTER FUNCTION public.prevent_membership_role_downgrade() OWNER TO "postgres";


-- ============================================================================
-- 3. ATTACH TRIGGER to memberships table
-- ============================================================================

CREATE TRIGGER trg_prevent_membership_role_downgrade
BEFORE UPDATE OF role, revoked_at
ON public.memberships
FOR EACH ROW
EXECUTE FUNCTION public.prevent_membership_role_downgrade();

COMMENT ON TRIGGER trg_prevent_membership_role_downgrade ON public.memberships IS
  'Defense-in-depth: Prevents downgrading member roles within same org.
   
   Scope: Fires only on UPDATE of role or revoked_at columns.
   Does not affect INSERT, DELETE, or other UPDATE columns.
   
   Performance: Simple priority comparison, <1ms per row.
   
   Interacts safely with: 
   - remove_member() RPC (allows revoked_at=NOW())
   - set_member_role() RPC (already prevents downgrades via logic)
   - Existing triggers (no conflicts, both fire independently)';


-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
-- 
-- To remove this trigger and functions:
-- 
-- DROP TRIGGER IF EXISTS trg_prevent_membership_role_downgrade ON public.memberships;
-- DROP FUNCTION IF EXISTS public.prevent_membership_role_downgrade() CASCADE;
-- DROP FUNCTION IF EXISTS public.get_role_priority(TEXT) CASCADE;
--
-- Verify: SELECT COUNT(*) FROM information_schema.triggers 
--         WHERE trigger_name = 'trg_prevent_membership_role_downgrade';
--         -- Should return 0
-- 
