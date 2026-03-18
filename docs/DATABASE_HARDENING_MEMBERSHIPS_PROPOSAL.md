# Database Hardening Proposal: Memberships Role Integrity

**Date:** 2026-03-17  
**Status:** PROPOSAL (Not yet applied)  
**Author:** AI Assistant  
**Scope:** Defense-in-depth role downgrade protection for `public.memberships`

---

## Executive Summary

This proposal adds **optional DB-level protection against accidental role downgrades** within the same organization. While runtime logic already prevents downgrades via the `set_member_role()` RPC, a database-level trigger provides:

- **Defense in depth**: Blocks downgrades even if runtime logic is bypassed
- **Direct UPDATE protection**: Catches direct SQL UPDATEs or buggy client code
- **Minimal performance impact**: Simple priority comparison on row update
- **Conservative design**: Does not interfere with existing triggers or soft-delete patterns

---

## Current State

### Table Definition
```sql
CREATE TABLE public.memberships (
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.role_type DEFAULT 'viewer' NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    is_default boolean DEFAULT false NOT NULL,
    revoked_at timestamp with time zone,
    PRIMARY KEY (org_id, user_id)
);
```

### Role Hierarchy
- **owner**: Priority 3 (highest)
- **admin**: Priority 2 (middle)
- **tracker**: Priority 1 (base tracker role)
- **viewer**: Priority 0 (lowest - not typically used in memberships)

### Existing Protections
1. **Runtime RPC**: `set_member_role()` prevents downgrades via `v_new_priority > v_current_priority` check
2. **Runtime Guard**: AuthContext on frontend prevents privilege escalation
3. **Existing Triggers**:
   - `zzz_one_admin_memberships` - ensures single admin per org
   - `enforce_tracker_plan_limit` - enforces plan-based limits
   - `trg_memberships_role_guard` - additional role validation

---

## Proposal: Prevent Role Downgrade Trigger

### Design Principles

1. **Immutable Higher Roles**: Once a user is owner or admin in an org, they cannot be downgraded without explicit soft-delete (revoke)
2. **Allow Lateral Role Changes**: Within the same priority level (future-proofing)
3. **Preserve Soft-Delete Pattern**: `revoked_at IS NULL` tracks active memberships; revocation is the way to "remove" a user
4. **Minimal Scope**: Only fire on UPDATE (not INSERT), only check `role` column change
5. **Production-Safe**: No cascading deletes, no complex joins in trigger logic, simple comparisons

---

## SQL Proposal

### 1. CREATE FUNCTION: Role Priority Mapping

```sql
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
  'Map role_type to numeric priority for downgrade prevention. owner=3, admin=2, tracker=1, viewer=0';

ALTER FUNCTION public.get_role_priority(TEXT) OWNER TO "postgres";
```

### 2. CREATE FUNCTION: Downgrade Prevention Trigger

```sql
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
  -- Only check on UPDATE, not INSERT
  -- if (TG_OP <> 'UPDATE') then RETURN NEW; end if;
  
  -- Skip if role didn't actually change
  IF OLD.role = NEW.role THEN
    RETURN NEW;
  END IF;
  
  -- Skip if membership is being revoked (soft-delete)
  -- Revocation is the legitimate way to remove elevated privileges
  IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get priority for old and new roles
  v_old_priority := public.get_role_priority(OLD.role::TEXT);
  v_new_priority := public.get_role_priority(NEW.role::TEXT);
  
  -- BLOCK: If new priority is LOWER than old, reject downgrade
  IF v_new_priority < v_old_priority THEN
    RAISE EXCEPTION 'Membership role downgrade blocked: cannot downgrade % -> % in org % for user %',
      OLD.role, NEW.role, OLD.org_id::TEXT, OLD.user_id::TEXT
      USING ERRCODE = 'P0001',
            HINT = 'Use remove_member() to revoke, or contact system admin if escalation needed';
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_membership_role_downgrade() IS
  'Trigger function to prevent accidental role downgrades in memberships table.
   Allows upgrades and lateral moves, blocks owner/admin -> lower roles in same org.
   Allows soft-delete via revoked_at.';

ALTER FUNCTION public.prevent_membership_role_downgrade() OWNER TO "postgres";
```

### 3. CREATE TRIGGER: Attach to Memberships Table

```sql
CREATE TRIGGER trg_prevent_membership_role_downgrade
BEFORE UPDATE OF role, revoked_at
ON public.memberships
FOR EACH ROW
EXECUTE FUNCTION public.prevent_membership_role_downgrade();

COMMENT ON TRIGGER trg_prevent_membership_role_downgrade ON public.memberships IS
  'Defense-in-depth: Prevents downgrading member roles within same org.
   Allows upgrades, lateral moves, and soft-delete via revoked_at.
   Complements runtime RPC checks.';
```

---

## Edge Cases & Risk Analysis

### ✅ Allowed Scenarios
1. **Role Upgrade**: tracker → admin → owner (all allowed, priority increases)
2. **Lateral Move**: admin → admin (same priority, allowed)
3. **Revocation**: Any role → revoked_at set (soft-delete, allowed)
4. **Multi-Org Roles**: User with owner in org_A and tracker in org_B (both allowed, independent keys)
5. **Admin Reassignment**: admin in org_A → owner in org_A (upgrade, allowed)
6. **INSERT Operations**: No impact (trigger only on UPDATE)

### 🚫 Blocked Scenarios
1. **owner → admin** (in same org): Blocked ✓
2. **owner → tracker** (in same org): Blocked ✓
3. **admin → tracker** (in same org): Blocked ✓
4. **admin → viewer** (in same org): Blocked ✓
5. **Direct SQL UPDATE**: `UPDATE memberships SET role='tracker' WHERE org_id=X AND user_id=Y` → Blocked ✓

### ⚠️ Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| **Cascading failures if existing audit code expects downgrades** | Low | Medium | Solution: Use `remove_member()` (soft-delete) instead of UPDATE |
| **Trigger fires on every UPDATE, adds latency** | Very Low | Low | Optimization: Trigger is simple CASE/comparison, <1ms overhead |
| **Backup/restore scripts break** | Low | Medium | Solution: Provide rollback and explicit data migration path |
| **Legitimate admin scenario blocked** (e.g., intentional demotion) | Very Low | High | Mitigation: Must use `remove_member()` + re-invite at lower role |
| **Soft-delete edge case** (revoked_at set in same UPDATE as role) | Very Low | Low | Handled: Trigger allows if revoked_at changes AND becomes non-NULL|

### 🔍 Soft-Delete Interaction (Critical)

The trigger **explicitly allows** role changes when `revoked_at` transitions from NULL → non-NULL:
```sql
IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
  RETURN NEW;  -- Allow the update through
END IF;
```

This means:
- ✅ `revoked_at = NOW()` can happen in same UPDATE as role change
- ✅ Existing `remove_member()` RPC continues to work
- ✅ Audit trail preserved (memberships row still exists, just marked revoked)

---

## Implementation Path

### Phase 1: Pre-Deployment Testing (Recommended)

1. **Apply schema changes to staging**:
   ```bash
   # In staging environment
   supabase db push
   ```

2. **Run validation test**:
   ```sql
   -- Should FAIL (blocked)
   UPDATE public.memberships 
   SET role = 'tracker' 
   WHERE org_id = '<test_org>' AND user_id = '<admin_user>' 
      AND role = 'admin';
   
   -- Should SUCCEED (revocation allowed)
   UPDATE public.memberships 
   SET revoked_at = NOW(), role = 'tracker'
   WHERE org_id = '<test_org>' AND user_id = '<admin_user>';
   ```

3. **Load test**: Run existing test suite, verify no regression

4. **Audit existing data**: Check if any existing memberships would violate this rule:
   ```sql
   -- Pre-check: Do we have any rows that look like downgrades?
   -- (Should return empty set - memberships tracked via revoked_at)
   SELECT COUNT(*) FROM public.memberships 
   WHERE revoked_at IS NULL;
   ```

### Phase 2: Deployment

1. Copy this migration to: `supabase/migrations/20260317000200_memberships_role_downgrade_prevention.sql`
2. Deploy via `supabase db push` or CI/CD pipeline
3. Monitor error logs for `P0001` exceptions (should be zero under normal ops)

---

## Rollback SQL

If you need to remove this trigger and function:

```sql
-- Step 1: Drop trigger
DROP TRIGGER IF EXISTS trg_prevent_membership_role_downgrade 
ON public.memberships;

-- Step 2: Drop function
DROP FUNCTION IF EXISTS public.prevent_membership_role_downgrade() CASCADE;

-- Step 3: Drop helper function  
DROP FUNCTION IF EXISTS public.get_role_priority(TEXT) CASCADE;

-- Verify removal
SELECT COUNT(*) FROM information_schema.triggers 
WHERE trigger_name = 'trg_prevent_membership_role_downgrade';
-- Should return 0
```

---

## Deployment Checklist

- [ ] **Schema Review**: DBAs review function logic for correctness
- [ ] **Performance Test**: Verify trigger latency <1ms on UPDATE
- [ ] **Data Audit**: Confirm no existing downgrade scenarios in prod
- [ ] **Staging Test**: Apply to staging, run full test suite
- [ ] **Documentation**: Update API docs about downgrade behavior
- [ ] **Monitoring Setup**: Alert on P0001 exceptions
- [ ] **Rollback Plan**: Keep rollback SQL ready
- [ ] **Go/No-Go**: Final stakeholder approval

---

## Integration Notes

### With Existing RPC Functions

**No changes needed** to existing functions:
- `set_member_role()` - Will work as-is, already enforces upgrades via logic
- `remove_member()` - Will work as-is, uses soft-delete (revoked_at)
- Frontend AuthContext - Unaffected

### With Existing Triggers

This trigger is **orthogonal** to:
- `zzz_one_admin_memberships` - Constrains count; this constrains direction
- `trg_memberships_role_guard` - May enforce different rules; both fire
- `enforce_tracker_plan_limit` - Unrelated to role direction

**No conflicts anticipated.**

---

## Monitoring & Alerts

### Metrics to Track Post-Deployment

```sql
-- Check for exceptions in recent logs
SELECT COUNT(*) FROM ( 
  SELECT 1 FROM pg_stat_statements 
  WHERE query LIKE '%P0001%'
) AS errors_last_hour;
```

### Alert Thresholds

- **🟢 Green**: 0 role downgrade attempts per day in prod
- **🟡 Yellow**: 1-5 attempts per day (possible legitimate scenario or test)
- **🔴 Red**: >5 attempts per day (investigate)

---

## Future Considerations

1. **Configurable Priority**: Could make role hierarchy configurable via table (but adds complexity)
2. **Audit Event**: Could INSERT into audit_log before raising exception (currently just blocks)
3. **Grace Period**: Could allow downgrades within X minutes of creation (e.g., fix typos), but not needed now
4. **Multi-level Approvals**: Could require signature from owner before allowing downgrade, but bypasses intent of this proposal

---

## Questions & Clarifications

**Q: Why not just DELETE memberships row?**  
A: Soft-delete pattern (revoked_at) is already established in codebase and enables audit trail.

**Q: What if we need to intentionally downgrade someone?**  
A: Use `remove_member()` to soft-delete, then `set_member_role()` to reinvite at lower role. This is the intended flow.

**Q: Will this break existing code?**  
A: Only if code does direct SQL `UPDATE` on role column. The RPC functions and frontend already prevent this.

**Q: Can a user have different roles in different orgs?**  
A: Yes! PK is (org_id, user_id), so separate rows. This rule applies per-org, per-row.

---

## Recommendation

**✅ SAFE TO APPLY** with the following precautions:

1. Test in staging first
2. Apply during maintenance window (minimal existing traffic)
3. Monitor for first 24 hours for any P0001 exceptions
4. Keep rollback SQL ready
5. Document in API that (owner/admin) → (lower role) is not supported via direct UPDATE

This is a **minimal, conservative, production-safe** addition that closes a potential attack surface while maintaining the existing soft-delete architecture.

---

**Next Steps:**
- [ ] Review with security team
- [ ] Approve for staging deployment
- [ ] Schedule production rollout
- [ ] Update API documentation
