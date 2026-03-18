# RLS POLICIES

## 1. Purpose

This document describes how **Row Level Security (RLS)** protects multi-tenant data in **App Geocercas**.

RLS intent in this architecture is tenant isolation:

- organizations should not access each other's data
- access should be scoped by organization membership context

Policy behavior in this document is classified as either:

- documented from schema documentation
- `INFERRED_SECURITY_MODEL` when exact policy SQL is not explicitly documented

This document **does not modify policies**. It is documentation-only.

---

## 2. Multi-Tenant Security Model

Documented structural model:

- `organizations`
- `memberships`
- `profiles`
- organization-scoped operational tables (commonly using `org_id`)

Expected security path:

`organizations -> memberships -> profiles/users -> organization-scoped data`

`org_id` role in security model:

- recurring tenant boundary key across operational domains
- often a **logical tenant boundary**, not necessarily a formal SQL FK in every table

`INFERRED_SECURITY_MODEL`:

- membership checks are likely the primary gate for row access in organization-scoped tables

---

## 3. Security Domains

### Identity and Membership

Tables:

- `organizations`
- `memberships`
- `profiles`

Documented signals:

- `memberships` is the base access model per organization and role
- schema map notes dominant security pattern based on membership by `org_id`

**Role Integrity Rule:**

Within the same `(org_id, user_id)` pair, a user's role cannot be downgraded. The role hierarchy is `owner > admin > tracker`. If an existing membership has a higher or equal priority role, any incoming role assignment (via invite or direct upsert) must preserve the existing role or upgrade it only if the new role is strictly higher. This rule applies regardless of membership active/revoked status and is enforced by the `safeUpsertMembership` function in `supabase/functions/_shared/safeMembership.ts`.

**Cross-org independence:**

Different organizations are completely independent. A user can be `owner` in org A and `tracker` in org B simultaneously. The integrity rule is strictly per-org.

Reference: `docs/ARCHITECTURE_MEMBERSHIPS.md` § 3 "The Universal Integrity Rule: No Role Downgrade Within an Org"

`INFERRED_SECURITY_MODEL`:

- exact RLS SQL conditions for each identity table are not enumerated in documentation

### Operational Entities

Tables:

- `personal`
- `org_people`

Documented signals:

- both carry organization context (`org_id` documented)
- both belong to operational domain scoped by organization

`INFERRED_SECURITY_MODEL`:

- read/write policies likely require membership in the same organization

### Territorial Configuration

Tables:

- `geofences`
- `geocercas`
- `asignaciones`

Documented signals:

- all participate in organization-scoped operations
- legacy/canonical coexistence is explicitly documented (`geocercas` vs `geofences`)

`INFERRED_SECURITY_MODEL`:

- RLS likely enforces tenant boundaries via organization membership checks across both canonical and legacy territorial paths

### Activity and Assignment Domain

Tables:

- `activities`
- `activity_assignments`

Documented signals:

- `activities` includes organization context (`org_id` documented)
- assignment domain is tied to operational planning and tracking

`INFERRED_SECURITY_MODEL`:

- `activity_assignments` likely follows tenant scoping through linked activity/tracker organization context

### Tracking Domain

Tables:

- `positions`
- `tracker_assignments`
- `tracker_geofence_events`
- `tracker_logs`
- `tracker_latest`

Documented signals:

- `positions`, `tracker_assignments`, and `tracker_geofence_events` explicitly include `org_id`
- schema map explicitly mentions RLS restriction for `tracker_geofence_events` to active memberships in same `org_id`
- `tracker_logs` and `tracker_latest` are documented as canonical live-tracking structures, but field-level policy details are not enumerated

`INFERRED_SECURITY_MODEL`:

- tracking visibility should be organization-bounded
- `tracker_logs` / `tracker_latest` likely require equivalent org-scoped filtering, but exact documented policy SQL is not provided

### Attendance Domain (documented, underconstrained)

Tables:

- `attendances`
- `asistencias`
- `attendance_events`

Documented signals:

- attendance variants are documented as coexisting
- canonical consolidation is not explicit

Classification:

- transitional / underdocumented for RLS policy clarity
- `INFERRED_SECURITY_MODEL` for concrete policy behavior

### Billing Domain

Table:

- `org_billing`

Documented signals:

- organization-scoped billing object with logical key by `org_id`

`INFERRED_SECURITY_MODEL`:

- likely restricted to organization admins/owners, but explicit policy SQL is not documented in source docs

---

## 4. Typical RLS Policy Patterns

The following are **patterns**, not confirmed policy SQL unless explicitly documented.

Pattern A: organization-scoped read/write

- user can access rows where row organization is in organizations where user has active membership

Pattern B: membership validation gate

- read/write allowed only when membership exists in same `org_id`
- role constraints may apply (`owner`, `admin`, `tracker`, `viewer`)

Pattern C: owner/user self-access

- row access may include user ownership checks such as `user_id = auth.uid()` where applicable

Pattern D: role-sensitive domains

- operational writes (assignments/billing/admin actions) likely require elevated roles

All patterns above are `INFERRED_SECURITY_MODEL` except where explicitly noted by schema documentation.

---

## 5. Table-Level Security Overview

| Table | Expected Tenant Key | Security Scope | Confidence |
| ----- | ------------------- | -------------- | ---------- |
| `organizations` | `id` | membership-based organization visibility | CONFIRMED |
| `memberships` | `org_id` | membership ownership and role-scoped access | INFERRED |
| `profiles` | `org_id` (context fields) | user profile context with org-scoped behavior | INFERRED |
| `personal` | `org_id` | organization-scoped operational entities | CONFIRMED |
| `org_people` | `org_id` | organization-scoped person linkage | INFERRED |
| `geofences` | `org_id` | organization-scoped territorial config | CONFIRMED |
| `geocercas` | `org_id` | legacy territorial scope by organization | CONFIRMED |
| `asignaciones` | `org_id` | organization-scoped assignment operations | CONFIRMED |
| `activities` | `org_id` | organization-scoped activity catalog | CONFIRMED |
| `activity_assignments` | `tenant_id` (legacy coexistence) | assignment scope via activity/tracker context | UNKNOWN |
| `positions` | `org_id` | organization-scoped tracking data | CONFIRMED |
| `tracker_assignments` | `org_id` | organization-scoped tracker assignment | INFERRED |
| `tracker_geofence_events` | `org_id` | explicitly documented membership-based org restriction | CONFIRMED |
| `tracker_logs` | undocumented in source docs | likely org-scoped tracking history | UNKNOWN |
| `tracker_latest` | undocumented in source docs | likely org-scoped latest tracking state | UNKNOWN |
| `tracker_positions` (legacy) | no explicit `org_id` in documented fields | compatibility path; tenant scoping likely indirect | UNKNOWN |
| `attendances` | undocumented in source docs | attendance scope likely org-based | UNKNOWN |
| `asistencias` | undocumented in source docs | attendance scope likely org-based | UNKNOWN |
| `attendance_events` | undocumented in source docs | attendance event scope likely org-based | UNKNOWN |
| `org_billing` | `org_id` | organization billing visibility, likely admin-restricted | UNKNOWN |

Notes:

- `CONFIRMED` is used only when behavior is explicitly documented.
- `INFERRED` and `UNKNOWN` represent `INFERRED_SECURITY_MODEL` levels.

---

## 6. RLS and Data Flow Interaction

RLS interaction with documented data flow:

- tracking ingestion and assignment resolution operate inside tenant scope
- geofence event generation should read only allowed rows and write events in tenant context
- assignment lookups should be constrained by organization membership context

Key principle:

- RLS applies to **database query access** (read/write authorization)
- RLS does not itself define internal business process sequencing

`INFERRED_SECURITY_MODEL`:

- exact invocation points and SQL policy expressions per flow step are not fully documented in source docs

---

## 7. Potential Security Risks

Possible risks if RLS coverage is incomplete or inconsistent:

- cross-organization data leakage
- tracking visibility across tenants
- assignment visibility or write-scope errors
- legacy table access bypassing canonical organization filters
- mixed `tenant_id`/`org_id` pathways causing inconsistent scoping

These are **possible risks**, not confirmed vulnerabilities.

---

## 8. Legacy and Transitional Areas

Domains requiring extra RLS auditing due to transition/coexistence:

- `geocercas` vs `geofences`
- `tracker_positions` vs `positions`
- membership variants (`memberships` vs `user_organizations` / `org_members` / `org_users`)
- attendance variants (`attendances`, `asistencias`, `attendance_events`)
- `tenant_id` remnants vs canonical `org_id`

Why this matters:

- transitional schemas increase the chance of policy gaps
- equivalent business data may be exposed through multiple structural paths

---

## 9. Recommended RLS Audit Checklist

Documentation guidance checklist for developers/auditors:

- verify operational tables have clear tenant key semantics (`org_id` or documented equivalent)
- verify policy filters are membership-based for organization-scoped domains
- verify role constraints for admin-sensitive areas (billing/admin operations)
- verify legacy tables are not exposed without equivalent tenant filtering
- verify tracker ingestion cannot write/read outside tenant scope
- verify event tables (`tracker_geofence_events`) preserve org-bound read/write behavior
- verify views used by app/API inherit or enforce tenant scope correctly
- verify mixed `tenant_id`/`org_id` tables have explicit policy treatment

---

## 10. Future Documentation Improvements

Recommended documentation expansions:

- policy-by-table SQL mapping (authoritative RLS SQL catalog)
- auth role definitions and access matrix
- RPC security model by function (caller role + row scope)
- service-role usage boundaries and operational controls
- tracking ingestion security path (writer identity and tenant validation)
- admin privilege model for organization and billing operations
- legacy deprecation timeline and policy parity checklist

---

## Source References

Primary:

- `docs/DB_SCHEMA_MAP.md`

Supporting context:

- `docs/DB_OVERVIEW.md`
- `docs/DATA_FLOW.md`
- `docs/TABLE_RELATION_DIAGRAM.md`
- `docs/MAPA_TECNICO.md`
