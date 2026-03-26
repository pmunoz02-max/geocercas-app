# QA Checklist: Memberships Role Integrity (Preview)

**Status**: Manual QA — run against preview/staging environment  
**Scope**: `memberships` table, `accept-tracker-invite` edge function, `safeUpsertMembership`  
**Role priority**: `owner (3) > admin (2) > tracker (1)`  
**Integrity rule**: Within the same `(org_id, user_id)`, role must never decrease.

---

## How to Use This Checklist

For each scenario:
1. Set up the precondition state in the DB (SQL block provided).
2. Trigger the action (invite flow or API call).
3. Verify all three layers: **DB state**, **UI behavior**, **API response**.

---

## Scenario 1 — Baseline: User becomes owner in org A

### Setup
```sql
-- Create user U, org A, assign owner membership
INSERT INTO memberships (org_id, user_id, role, revoked_at)
VALUES ('<org_a_id>', '<user_u_id>', 'owner', NULL);
```

### Action
No action — this is the starting precondition for scenarios 2, 3, and 4.

### Expected DB state
| org_id | user_id | role  | revoked_at |
|--------|---------|-------|------------|
| org_A  | user_U  | owner | NULL       |

### Expected UI behavior
- User sees org A in their org switcher.
- User has full owner controls (invite members, billing, settings).

### Expected API behavior
_(No API call for baseline setup — confirm via DB query only.)_

---

## Scenario 2 — Cross-org: owner in A accepts tracker invite in org B

### Precondition
Scenario 1 state. No membership for user_U in org B.

### Action
Trigger `accept-tracker-invite` for `org_id = org_B`, `user_id = user_U`.

### Expected DB state
| org_id | user_id | role    | revoked_at |
|--------|---------|---------|------------|
| org_A  | user_U  | owner   | NULL       |
| org_B  | user_U  | tracker | NULL       |

- Org A membership **must be completely unchanged**.
- Org B membership must be a new row with `role = 'tracker'`.

### Expected UI behavior
- Org switcher now shows both org A and org B.
- In org A: user retains all owner controls.
- In org B: user sees only tracker-level views (no admin/settings access).

### Expected API response
```json
{
  "ok": true,
  "membership_action": "inserted",
  "membership_role_applied": "tracker",
  "membership_role_existing": null
}
```

### Verification query
```sql
SELECT org_id, role, revoked_at
FROM memberships
WHERE user_id = '<user_u_id>'
  AND org_id IN ('<org_a_id>', '<org_b_id>');
-- Must return exactly 2 rows: owner in A, tracker in B
```

---

## Scenario 3 — Integrity: owner in A receives tracker invite for org A

### Precondition
Scenario 1 state only (no org B membership needed).

### Action
Trigger `accept-tracker-invite` for `org_id = org_A`, `user_id = user_U`.

### Expected DB state
| org_id | user_id | role  | revoked_at |
|--------|---------|-------|------------|
| org_A  | user_U  | owner | NULL       |

- Row must be **identical** to before. No new row. No role change. `updated_at` should not change if the function uses `kept` path.

### Expected UI behavior
- No visible change for the user. Owner controls remain intact.
- No error shown. Invite acceptance completes silently.

### Expected API response
```json
{
  "ok": true,
  "membership_action": "kept",
  "membership_role_applied": "owner",
  "membership_role_existing": "owner"
}
```

> **Red flag**: If `membership_action` is `"inserted"` or `membership_role_applied` is `"tracker"` — the downgrade protection is broken.

### Verification query
```sql
SELECT role FROM memberships
WHERE org_id = '<org_a_id>' AND user_id = '<user_u_id>' AND revoked_at IS NULL;
-- Must return exactly: owner
```

---

## Scenario 4 — Integrity: admin in A receives tracker invite for org A

### Setup
```sql
INSERT INTO memberships (org_id, user_id, role, revoked_at)
VALUES ('<org_a_id>', '<user_v_id>', 'admin', NULL);
```

### Action
Trigger `accept-tracker-invite` for `org_id = org_A`, `user_id = user_V`.

### Expected DB state
| org_id | user_id | role  | revoked_at |
|--------|---------|-------|------------|
| org_A  | user_V  | admin | NULL       |

- Row must remain `admin`. No downgrade to `tracker`.

### Expected UI behavior
- User V sees admin-level controls in org A (cannot access billing/owner settings, but can manage members and assets).
- No error shown.

### Expected API response
```json
{
  "ok": true,
  "membership_action": "kept",
  "membership_role_applied": "admin",
  "membership_role_existing": "admin"
}
```

> **Red flag**: `membership_role_applied` = `"tracker"` or `membership_action` = `"inserted"` indicates a regression.

### Verification query
```sql
SELECT role FROM memberships
WHERE org_id = '<org_a_id>' AND user_id = '<user_v_id>' AND revoked_at IS NULL;
-- Must return: admin
```

---

## Scenario 5 — New user accepts tracker invite in org C

### Setup
User W has no memberships anywhere.

### Action
Trigger `accept-tracker-invite` for `org_id = org_C`, `user_id = user_W`.

### Expected DB state
| org_id | user_id | role    | revoked_at |
|--------|---------|---------|------------|
| org_C  | user_W  | tracker | NULL       |

- Exactly one new row. No other rows for user_W.

### Expected UI behavior
- Org C appears in user W's org switcher.
- User W sees tracker-level views only. No admin or settings access.
- If user W had no prior org, the app sets org C as the active org.

### Expected API response
```json
{
  "ok": true,
  "membership_action": "inserted",
  "membership_role_applied": "tracker",
  "membership_role_existing": null,
  "current_org_persisted": true
}
```

### Verification query
```sql
SELECT COUNT(*) FROM memberships WHERE user_id = '<user_w_id>';
-- Must return: 1

SELECT role FROM memberships
WHERE user_id = '<user_w_id>' AND org_id = '<org_c_id>' AND revoked_at IS NULL;
-- Must return: tracker
```

---

## Scenario 6 — Idempotency: re-accept or repeat invite does not corrupt role

### Sub-case A: Repeat tracker invite for an existing tracker
Trigger `accept-tracker-invite` **twice** for the same `(org_id, user_id)`.

#### Expected DB state after second call
No change. Still exactly one active membership row with `role = 'tracker'`.

#### Expected API response (second call)
```json
{
  "ok": true,
  "membership_action": "kept",
  "membership_role_applied": "tracker",
  "membership_role_existing": "tracker"
}
```

### Sub-case B: Repeat tracker invite for a higher-role user (owner/admin)
Already covered by Scenarios 3 and 4 — same result applies regardless of number of repetitions.

### Sub-case C: Race — two simultaneous invite acceptances
Trigger two near-simultaneous `accept-tracker-invite` calls for the same `(org_id, user_id)`.

#### Expected DB state
One active row with the correct role. No duplicate rows. No corrupt state.

#### Verification query
```sql
SELECT COUNT(*) FROM memberships
WHERE org_id = '<org_id>' AND user_id = '<user_id>' AND revoked_at IS NULL;
-- Must return: 1
```

> The unique constraint on `(org_id, user_id)` + `revoked_at IS NULL` enforces this at the DB level. If both calls succeed with `"inserted"`, one was a race artifact — check for DB constraint errors in logs.

---

## Scenario 7 — Revoked membership reactivation respects role precedence

### Sub-case A: Revoked admin reactivated via tracker invite
```sql
-- Setup: user had admin, was revoked
UPDATE memberships
SET revoked_at = NOW()
WHERE org_id = '<org_a_id>' AND user_id = '<user_v_id>';
```

Trigger `accept-tracker-invite` for `org_id = org_A`, `user_id = user_V`.

#### Expected DB state
| org_id | user_id | role  | revoked_at |
|--------|---------|-------|------------|
| org_A  | user_V  | admin | NULL       |

- `revoked_at` is cleared (set to NULL) — membership is reactivated.
- `role` stays `admin`. The incoming `tracker` invite must **not** downgrade a revoked `admin`.

#### Expected API response
```json
{
  "ok": true,
  "membership_action": "kept",
  "membership_role_applied": "admin",
  "membership_role_existing": "admin"
}
```

> **Red flag**: `membership_action` = `"inserted"` (means revoked row was not found, a new row was created with `tracker` — indicates the lookup for revoked records failed).

#### Verification query
```sql
SELECT role, revoked_at FROM memberships
WHERE org_id = '<org_a_id>' AND user_id = '<user_v_id>';
-- Must return: role=admin, revoked_at=NULL
```

### Sub-case B: Revoked tracker reactivated via tracker invite
```sql
-- Setup: user had tracker, was revoked
UPDATE memberships
SET revoked_at = NOW()
WHERE org_id = '<org_c_id>' AND user_id = '<user_w_id>';
```

Trigger `accept-tracker-invite` for `org_id = org_C`, `user_id = user_W`.

#### Expected DB state
| org_id | user_id | role    | revoked_at |
|--------|---------|---------|------------|
| org_C  | user_W  | tracker | NULL       |

- Reactivated with same role (`tracker` = `tracker`, equal priority → `kept`).

#### Expected API response
```json
{
  "ok": true,
  "membership_action": "kept",
  "membership_role_applied": "tracker",
  "membership_role_existing": "tracker"
}
```

### Sub-case C: Revoked tracker reactivated via admin invite (hypothetical upgrade path)
> _(For completeness — not part of the invite flow today, but validates `safeUpsertMembership` upgrade logic if called directly.)_

```sql
-- Call safeUpsertMembership with new_role='admin' for a revoked tracker user
```

Expected: `action = "upgraded"`, `role_applied = "admin"`, `revoked_at = NULL`.

---

## Summary: Expected `membership_action` by Scenario

| # | Scenario | `membership_action` | `membership_role_applied` |
|---|----------|---------------------|---------------------------|
| 2 | New tracker in org B (new user in that org) | `inserted` | `tracker` |
| 3 | Owner in A + tracker invite in A | `kept` | `owner` |
| 4 | Admin in A + tracker invite in A | `kept` | `admin` |
| 5 | No prior membership + tracker invite | `inserted` | `tracker` |
| 6A | Repeat tracker invite (same role) | `kept` | `tracker` |
| 7A | Revoked admin reactivated via tracker invite | `kept` | `admin` |
| 7B | Revoked tracker reactivated via tracker invite | `kept` | `tracker` |

---

## Common Red Flags

| Symptom | What it means |
|---------|---------------|
| `membership_action: "inserted"` when user already had a higher role | Revoked membership lookup failed; a new lower-role row was created |
| `membership_role_applied: "tracker"` for an owner or admin | Downgrade protection not firing — direct upsert bypassing `safeUpsertMembership` |
| Two active rows with same `(org_id, user_id)` | Missing unique constraint or RLS gap |
| `revoked_at` still set after reactivation | `safeUpsertMembership` reactivation path did not write `revoked_at = null` |
| Org switcher shows incorrect role for a session | Frontend reading stale cached membership; force a session refresh |

---

## Related Files

| File | Purpose |
|------|---------|
| [supabase/functions/_shared/safeMembership.ts](../supabase/functions/_shared/safeMembership.ts) | Source of truth for role-integrity logic |
| [supabase/functions/accept-tracker-invite/index.ts](../supabase/functions/accept-tracker-invite/index.ts) | Edge function — only safe entry point for invite acceptance |
| [api/accept-tracker-invite.js](../api/accept-tracker-invite.js) | Vercel proxy — validates HMAC before forwarding to edge function |
| [docs/ARCHITECTURE_MEMBERSHIPS.md](ARCHITECTURE_MEMBERSHIPS.md) | Full architecture reference |
| [docs/MEMBERSHIPS_HARDENING_QUICK_REFERENCE.md](MEMBERSHIPS_HARDENING_QUICK_REFERENCE.md) | DB-level trigger proposal (not yet applied) |
