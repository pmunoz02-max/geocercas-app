## Quick Reference: Memberships Role Downgrade Prevention

**Status**: ⚠️ PROPOSAL ONLY - NOT YET APPLIED  
**Created**: 2026-03-17  
**Risk Level**: 🟢 LOW (minimal, orthogonal addition)  

---

## What This Proposes

A **single optional trigger** that prevents accidental role downgrades in memberships:

```
❌ BLOCKED:  owner  → admin     (same org)
❌ BLOCKED:  owner  → tracker   (same org)
❌ BLOCKED:  admin  → tracker   (same org)
✅ ALLOWED:  tracker → admin    (upgrade)
✅ ALLOWED:  admin  → owner     (upgrade)
✅ ALLOWED:  any role + revoked_at = NOW() (soft-delete/revoke)
```

---

## Files Created

| File | Purpose |
|------|---------|
| `docs/DATABASE_HARDENING_MEMBERSHIPS_PROPOSAL.md` | **Full proposal** - read this for details |
| `supabase/migrations/20260317000200_memberships_role_downgrade_prevention.sql` | **Production SQL** - apply this if approved |
| `docs/TEST_MEMBERSHIPS_ROLE_DOWNGRADE.sql` | **Validation tests** - run these before/after |

---

## Key Points

### Why Add This?
- **Defense in depth**: Runtime `set_member_role()` RPC already prevents downgrades
- **Closes attack surface**: Blocks direct SQL or buggy clients
- **Minimal risk**: Simple priority comparison, no cascading logic

### How It Works
1. **Trigger fires on**: `UPDATE OF role, revoked_at` only
2. **Allows**: Upgrades, lateral moves, soft-delete (revoked_at = NOW())
3. **Blocks**: Any downgrade detected by priority comparison
4. **Error code**: `P0001` - easily monitored/alerted

### Safe Integration
- ✅ Does NOT touch INSERT logic
- ✅ Does NOT affect existing RPC functions
- ✅ Does NOT create new dependencies
- ✅ Does NOT modify soft-delete pattern (revoked_at)
- ✅ Does NOT interfere with other triggers

---

## Decision Matrix

| Scenario | What Happens | Is It OK? |
|----------|--------------|----------|
| Someone runs `UPDATE ... SET role='tracker' WHERE role='admin'` | Trigger blocks it with P0001 | ✓ Yes - that's the point |
| `remove_member()` RPC used | Still works (uses soft-delete) | ✓ Yes - no change |
| `set_member_role()` RPC used | Still works (logic already prevented downgrades) | ✓ Yes - no change |
| Frontend tries to downgrade | Blocked at DB level now (was already blocked at RPC) | ✓ Yes - defense in depth |
| User in org_a=owner, org_b=tracker | Both roles exist independently | ✓ Yes - per-org enforcement |
| Must intentionally demote someone | Use `remove_member()` then re-invite | ✓ Yes - soft-delete is intended way |

---

## Deployment Steps (If Approved)

### 1. Staging Validation (Required)
```bash
cd geocercas-app
supabase db push  # Apply migration to staging ENV

# Then run validation tests:
psql <staging_connection> -f docs/TEST_MEMBERSHIPS_ROLE_DOWNGRADE.sql
```

### 2. Production Application (If Approved)
```bash
# Deploy via normal migration process
supabase db push  # Applies to production

# Monitor:
psql <prod_connection> -c \
  "SELECT COUNT(*) FROM pg_stat_statements WHERE query LIKE '%P0001%';"
# Should return 0 under normal operations
```

### 3. Rollback (If Needed)
```bash
psql <connection> <<'EOF'
DROP TRIGGER trg_prevent_membership_role_downgrade ON public.memberships;
DROP FUNCTION prevent_membership_role_downgrade();
DROP FUNCTION get_role_priority(TEXT);
EOF
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Existing code breaks | Low | Medium | Use soft-delete via `remove_member()` instead of UPDATE |
| Performance impact | Very Low | Low | <1ms per row; simple comparison logic |
| Legitimate demotions blocked | Very Low | High | Must revoke + re-invite (soft-delete pattern) |
| Backup/restore scripts fail | Low | Medium | Provide rollback SQL; test in staging first |

---

## Monitoring Post-Deployment

### What to Watch
```sql
-- Check for downgrade attempts (should be zero)
SELECT 
  COUNT(*) AS blocked_attempts,
  DATE(query_time) AS date
FROM pg_stat_statements 
WHERE query LIKE '%P0001%'
  AND query_time > NOW() - INTERVAL '24 hours'
GROUP BY date;
```

### Alert Thresholds
- 🟢 **0 per day** = Normal
- 🟡 **1-5 per day** = Investigate (possible legitimate demotions)
- 🔴 **>5 per day** = Alert - likely misconfiguration

---

## FAQ

**Q: Will this break existing functionality?**  
A: No. Existing RPCs and frontend already prevent downgrades. This just adds DB-level redundancy.

**Q: What if we need to demote someone?**  
A: Use `remove_member()` (soft-delete), then `set_member_role()` to invite at lower role. This is the intended flow.

**Q: Can a user have different roles in different orgs?**  
A: Yes! The PK is `(org_id, user_id)`, so each org has a separate row. Rule applies per-row.

**Q: How much performance impact?**  
A: <1ms. It's just two CASE statements and a comparison.

**Q: Is this reversible?**  
A: Yes. Simple `DROP TRIGGER` and `DROP FUNCTION` with no dependencies.

---

## Recommendation

### ✅ SAFE TO APPLY

**Preconditions:**
1. [ ] Test in staging first
2. [ ] Review error logs for 24 hours
3. [ ] Get DB team approval
4. [ ] Update API documentation

**Expected Value:**
- Closes a potential attack surface
- Complements existing runtime checks
- Minimal operational overhead
- Easy to rollback if needed

---

## Contact & Escalation

If questions:
1. See: `docs/DATABASE_HARDENING_MEMBERSHIPS_PROPOSAL.md` (full proposal)
2. Run: `docs/TEST_MEMBERSHIPS_ROLE_DOWNGRADE.sql` (validate behavior)
3. Ask: DB team for approval on staging deployment

---

**Next Action**: Schedule staging deployment + full test suite run, then review results before production.
