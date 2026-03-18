# Architecture: Memberships & Role Integrity

## Overview

The `memberships` table is the single source of truth for which users belong to which organizations and what they are allowed to do inside them. Misusing this table — especially writing to it directly — is one of the most common ways to corrupt user access state.

This document explains how memberships work, what the integrity rules are, and why the only safe write path goes through `safeUpsertMembership`.

---

## 1. Membership Scope

Every membership record is scoped by the composite key `(org_id, user_id)`.

```
memberships
├── org_id   ← which organization
├── user_id  ← which user
├── role     ← what they can do inside that org
└── revoked_at ← null = active, non-null = revoked
```

A user can belong to multiple organizations simultaneously. Each membership is **independent**: the role in org A has no bearing on the role in org B.

There is no concept of a "global role" for a user. Role is always per-org.

---

## 2. Role Hierarchy

Roles are strictly ordered:

```
owner  (priority 3)
  │
admin  (priority 2)
  │
tracker (priority 1)
```

`owner` is the highest privilege. `tracker` is the most restricted. Numeric priority values are defined in `_shared/safeMembership.ts`:

```ts
const ROLE_PRIORITY: Record<MembershipRole, number> = {
  owner:   3,
  admin:   2,
  tracker: 1,
};
```

---

## 3. The Universal Integrity Rule: No Role Downgrade Within an Org

**Within the same `(org_id, user_id)` pair, a role must never decrease.**

- If the existing active role has a higher or equal priority than the incoming role, the existing role is kept unchanged.
- Only upgrades (strictly higher priority) are applied.
- This rule applies regardless of whether the membership is active or previously revoked.

### Why this matters

An `owner` who receives a tracker invite for their own org must not lose ownership. An `admin` whose invite is re-sent should not be silently demoted. Direct upserts to the `memberships` table with a fixed role (e.g., `role = 'tracker'`) bypass this check and will corrupt the membership.

### Cross-org behavior

Different roles across different orgs are perfectly valid. The integrity rule is scoped to a single `org_id`:

| Scenario | Result |
|---|---|
| User is `owner` in org A, receives `tracker` invite in org A | Role stays `owner` — no downgrade |
| User is `owner` in org A, receives `tracker` invite in org B | Role becomes `tracker` in org B — valid, orgs are independent |
| User has no membership in org B, receives `tracker` invite | New membership created with role `tracker` |
| User has revoked `admin` membership in org A, accepts `tracker` invite for org A | Membership reactivated as `admin` — revoked role beats incoming lower role |

---

## 4. The Canonical Write Path

### `safeUpsertMembership` — the only safe writer

**File:** `supabase/functions/_shared/safeMembership.ts`

All membership writes must go through this function. It implements the role-integrity logic and handles all three cases:

1. **No membership exists** → insert with the requested role.
2. **A revoked membership exists** → reactivate it, upgrading the role only if the incoming role is strictly higher.
3. **An active membership exists** → keep the current role if it is equal or higher; upgrade only if incoming role is strictly higher.

The function returns a typed result object with `ok`, `action`, and `role_applied` so callers can log or handle each outcome:

```ts
{ ok: true,  action: "inserted",    role_applied: "tracker" }
{ ok: true,  action: "kept",        role_applied: "owner"   }  // downgrade blocked
{ ok: true,  action: "upgraded",    role_applied: "admin"   }
{ ok: false, action: "select_failed", error: ... }
```

### `accept-tracker-invite` — the protected entry point for external invites

**File:** `supabase/functions/accept-tracker-invite/index.ts`  
**Proxy:** `api/accept-tracker-invite.js`

This is the only legitimate way to onboard a new tracker through an invite flow. It:

1. Validates the request with an HMAC-signed proxy secret (`X-Proxy-Signature`) — no unauthenticated caller can reach it directly.
2. Resolves the `user_id` from the JWT or email if not explicitly supplied.
3. Calls `safeUpsertMembership(admin, { org_id, user_id, new_role: "tracker" })`.
4. Handles `tracker_org_users` linkage as a side effect.

The function deliberately hardcodes `new_role: "tracker"` for invite flows, relying on `safeUpsertMembership` to enforce that existing higher roles are never overwritten.

```
Invite flow:
  api/accept-tracker-invite.js  (Vercel API route, validates HMAC)
        │
        ▼
  supabase/functions/accept-tracker-invite/index.ts  (Edge Function, validates HMAC again)
        │
        ▼
  _shared/safeMembership.ts → safeUpsertMembership()
        │
        ▼
  memberships table  (role integrity guaranteed)
```

---

## 5. Examples

### Valid: owner in org A + tracker invite in org B

```
memberships before:
  (org_id=A, user_id=U, role='owner')

invite accepted for org B:
  safeUpsertMembership({ org_id: B, user_id: U, new_role: 'tracker' })

memberships after:
  (org_id=A, user_id=U, role='owner')   ← unchanged
  (org_id=B, user_id=U, role='tracker') ← inserted
```

### Safe: owner in org A receives tracker invite for org A

```
memberships before:
  (org_id=A, user_id=U, role='owner')

invite accepted for org A:
  safeUpsertMembership({ org_id: A, user_id: U, new_role: 'tracker' })

  ROLE_PRIORITY['tracker'] (1) < ROLE_PRIORITY['owner'] (3)
  → action: "kept", role_applied: "owner"

memberships after:
  (org_id=A, user_id=U, role='owner')   ← unchanged, downgrade blocked
```

### Reactivation: revoked admin accepts tracker invite

```
memberships before:
  (org_id=A, user_id=U, role='admin', revoked_at='2025-...')

invite accepted for org A:
  safeUpsertMembership({ org_id: A, user_id: U, new_role: 'tracker' })

  No active membership found. Revoked membership found with role 'admin'.
  ROLE_PRIORITY['tracker'] (1) < ROLE_PRIORITY['admin'] (2)
  → reactivate with role 'admin', action: "kept"

memberships after:
  (org_id=A, user_id=U, role='admin', revoked_at=null) ← reactivated, role preserved
```

---

## 6. Anti-Patterns — Do Not Do These

### ❌ Direct upsert with a hardcoded role

```ts
// WRONG — this will silently downgrade an owner to tracker
await supabase
  .from("memberships")
  .upsert({ org_id, user_id, role: "tracker" });
```

This bypasses all integrity checks. If the user is already an `owner` or `admin`, their role will be quietly overwritten.

### ❌ Direct insert without checking for an existing membership

```ts
// WRONG — will fail on unique constraint or insert a duplicate
await supabase
  .from("memberships")
  .insert({ org_id, user_id, role: "tracker" });
```

The table uses `(org_id, user_id)` as a unique key for active memberships. A direct insert without prior existence checks will either throw a unique-violation error or create inconsistent state.

### ❌ Calling the Edge Function directly without HMAC verification

The `accept-tracker-invite` Edge Function requires a valid `X-Proxy-Signature` header derived from `TRACKER_PROXY_SECRET`. Any caller without this secret is rejected with HTTP 401. Do not attempt to call the function from client-side code or without the proxy layer.

### ❌ Assuming `revoked_at IS NOT NULL` means the role can be freely reset

A revoked membership still carries its last known role. `safeUpsertMembership` always compares against the revoked role before reactivation. Do not assume a fresh `tracker` role can be written just because the membership is revoked.

---

## 7. Implementation Reference

| File | Purpose |
|---|---|
| `supabase/functions/_shared/safeMembership.ts` | Role-integrity logic, the only safe writer |
| `supabase/functions/accept-tracker-invite/index.ts` | Edge Function: validates HMAC, calls `safeUpsertMembership` |
| `api/accept-tracker-invite.js` | Vercel API proxy: authenticates request, forwards to Edge Function with HMAC |

---

## 8. Summary

| Rule | Detail |
|---|---|
| Membership scope | `(org_id, user_id)` — always per-org |
| Role is per-org | No global role concept |
| Role hierarchy | `owner > admin > tracker` |
| No downgrade within same org | `safeUpsertMembership` enforces this unconditionally |
| Cross-org different roles | Always valid |
| Only safe write path | `safeUpsertMembership` |
| Only safe invite entry point | `accept-tracker-invite` Edge Function via HMAC-signed proxy |
| Direct table upserts | Dangerous — never use for role setting |
