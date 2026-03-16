# MULTI-TENANT SECURITY AUDIT

## 1. Purpose

This document audits the **tenant isolation model** of App Geocercas.

The platform is designed to isolate data by organization. This audit analyzes:

- schema documentation
- data-flow documentation
- RLS documentation

This document **does not change the system**. It is analysis-only.

---

## 2. Multi-Tenant Architecture Overview

Intended tenant boundary model (documented):

`organizations -> memberships -> users/profiles -> organization-scoped operational data`

Key tenant boundary concept:

- `org_id` is the dominant tenant key across operational domains.

Important architecture detail:

- some tables appear directly tenant-scoped by `org_id`
- some tables appear indirectly tenant-scoped through joins (for example through person, assignment, or geofence context)

Audit interpretation baseline:

- `docs/DB_SCHEMA_MAP.md` is authoritative
- undocumented mechanics are treated as potential risk or documentation gap, not confirmed risk

---

## 3. Tenant Boundary Keys

Primary boundary keys observed in documentation:

- `org_id` (dominant tenant partition key)
- `user_id` (identity linkage; tenant-safe only when constrained by membership/org context)
- `personal_id` (operational identity linkage; tenant-safe only when mapped to organization scope)

How boundaries propagate (documented/inferred):

- Organizational domain: `organizations`, `memberships`, `profiles`
- Operational entities: `personal`, `org_people`
- Territorial configuration: `geofences`, `geocercas`, `asignaciones`
- Tracking: `positions`, `tracker_assignments`, `tracker_geofence_events`, plus `tracker_logs`/`tracker_latest`

Potential weak boundary points:

- tables without explicit `org_id`
- legacy variants with mixed keys (`tenant_id` and older structures)
- data paths relying on indirect joins instead of direct tenant key filtering

---

## 4. Tables Without Explicit Tenant Key

Assessment based strictly on `DB_SCHEMA_MAP.md` and supporting docs.

| Table | Documented Tenant Key Clarity | Finding |
| ----- | ----------------------------- | ------- |
| `tracker_logs` | No key fields documented in schema map section | DOCUMENTATION_GAP |
| `tracker_latest` | No key fields documented in schema map section | DOCUMENTATION_GAP |
| `tracker_positions` | Documented fields include `user_id`, `geocerca_id`, but no `org_id` | POTENTIAL_RISK |
| `activity_assignments` | Uses `tenant_id`; canonical boundary is mostly `org_id` | POTENTIAL_RISK |
| `attendances` | Domain documented, key-level tenant details not explicit | DOCUMENTATION_GAP |
| `asistencias` | Domain documented, key-level tenant details not explicit | DOCUMENTATION_GAP |
| `attendance_events` | Domain documented, key-level tenant details not explicit | DOCUMENTATION_GAP |

Interpretation note:

- none of the above is a confirmed vulnerability by documentation alone
- these are risk surfaces due to missing or transitional tenant-key clarity

---

## 5. RLS Coverage Analysis

Using `docs/RLS_POLICIES.md` and `docs/DB_SCHEMA_MAP.md`:

### Organizational data

- `organizations`, `memberships`, `profiles`
- Status: **partially documented, mostly inferred**
- Finding: DOCUMENTATION_GAP (policy SQL not mapped per table)

### Operational entities

- `personal`, `org_people`
- Status: org-scoped model is documented; policy expressions not explicit
- Finding: POTENTIAL_RISK (if join/filters are inconsistent), otherwise likely safe by model

### Territorial configuration

- `geofences`, `geocercas`, `asignaciones`
- Status: domain is org-scoped; coexistence adds complexity
- Finding: POTENTIAL_RISK (legacy/canonical coexistence)

### Tracking data

- `positions`, `tracker_assignments`, `tracker_geofence_events`, `tracker_logs`, `tracker_latest`
- Status:
  - `tracker_geofence_events` has explicitly documented org membership restriction
  - other tables have mixed clarity
- Finding:
  - `tracker_geofence_events`: NO_RISK_IDENTIFIED (from documentation)
  - others: POTENTIAL_RISK / DOCUMENTATION_GAP depending on table

### Attendance data

- `attendances`, `asistencias`, `attendance_events`
- Status: transitional/underdocumented
- Finding: DOCUMENTATION_GAP

### Billing data

- `org_billing`
- Status: org key exists, role-level restrictions not explicitly documented
- Finding: POTENTIAL_RISK (admin-scope policy details unclear)

Overall RLS consistency conclusion:

- broad tenant-isolation intent is documented
- table-by-table policy behavior is incompletely documented
- therefore several areas remain potential risk or documentation gaps

---

## 6. Tracking System Isolation

Tracking pipeline considered:

- `tracker_assignments`
- `positions`
- `tracker_geofence_events`
- `tracker_latest`

Potential isolation concerns:

1. Cross-organization tracking visibility in derived/latest structures
- `tracker_latest` is documented functionally but tenant-key/policy details are not explicit.
- Classification: DOCUMENTATION_GAP

2. Assignment-to-position scoping mismatch
- If assignment resolution is not strictly tenant-constrained, tracker data could be resolved incorrectly.
- Classification: POTENTIAL_RISK

3. Event leakage
- `tracker_geofence_events` has explicit org membership RLS note in schema docs.
- Classification: NO_RISK_IDENTIFIED (documentation-level)

4. Legacy tracking coexistence
- `tracker_positions` (legacy) can introduce parallel access paths not clearly aligned with canonical `positions` controls.
- Classification: POTENTIAL_RISK

---

## 7. Legacy Schema Exposure

Legacy/transitional objects in scope:

- `geocercas` (coexisting with `geofences`)
- `tracker_positions` (coexisting with `positions`)
- membership variants (`user_organizations`, `org_members`, `org_users`)
- attendance variants (`attendances`, `asistencias`, `attendance_events`)

Risk interpretation:

- legacy coexistence increases chance of inconsistent filtering across code paths
- if legacy paths are still queried but not equally policy-constrained, tenant isolation can degrade

Classification:

- POTENTIAL_RISK for legacy path exposure
- DOCUMENTATION_GAP where policy mapping for legacy objects is not explicit

---

## 8. Indirect Tenant Scoping Risks

Observed pattern:

- some security boundaries may depend on joins rather than direct `org_id` filters.

Examples (model-level patterns):

- `positions -> personal -> org_id`
- `events -> geofence -> org_id`
- assignment-centric joins (`asignaciones`, `tracker_assignments`) to infer tenant scope

Potential issues:

- incorrect join predicates
- missing tenant filter in one branch of a complex query
- RPC/function returning rows before tenant restriction is applied

Classification:

- POTENTIAL_RISK (architecturally plausible)
- not classified as confirmed vulnerability from docs alone

---

## 9. Service Role / RPC Risk Surface

Documented elements:

- multiple RPC functions exist across org, invites, geocercas/admin, and costs/tracking domains
- architecture includes API + Supabase + PostgreSQL

Not fully documented:

- explicit service-role boundaries
- per-RPC tenant-filter guarantees
- RLS bypass safeguards for privileged execution contexts

Risk surface:

- service role can bypass RLS if used broadly
- RPCs can leak cross-tenant rows if tenant predicates are incomplete
- ingestion/background paths may bypass intended tenant filters if not consistently enforced

Classification:

- DOCUMENTATION_GAP (primary)
- POTENTIAL_RISK (secondary, due to missing documented guarantees)

---

## 10. Highest Priority Risk Areas

Prioritized from architecture and documentation evidence.

| Risk | Domain | Severity | Confidence |
| ---- | ------ | -------- | ---------- |
| Missing explicit tenant-key/policy clarity in `tracker_logs` / `tracker_latest` | Tracking visibility | High | INFERRED |
| Legacy tracking path (`tracker_positions`) may bypass canonical tenant controls | Tracking legacy | High | INFERRED |
| Mixed key model (`tenant_id` + `org_id`) in assignment/cost areas | Assignment/cost domain | Medium | INFERRED |
| Attendance domain has variant tables with weak policy documentation | Attendance | Medium | UNKNOWN |
| RPC/service-role tenant filtering not documented per function | RPC/security model | Medium | UNKNOWN |
| Explicit org-scoped RLS note for `tracker_geofence_events` | Tracking events | Low | CONFIRMED |

Finding classification summary:

- **CONFIRMED_RISK**: none identified from documentation alone
- **POTENTIAL_RISK**: legacy coexistence, indirect scoping, mixed key paths
- **DOCUMENTATION_GAP**: table-level policy SQL, service role model, RPC policy guarantees
- **NO_RISK_IDENTIFIED**: `tracker_geofence_events` org-scoped read restriction is explicitly documented

---

## 11. Recommended Security Improvements

Documentation-level recommendations only:

1. Publish a table-by-table RLS policy map with exact policy intent and role scope.
2. Document canonical tenant key per table (`org_id`, `tenant_id`, or indirect path).
3. Add explicit tenant-isolation notes for `tracker_logs` and `tracker_latest`.
4. Document legacy table access policy parity (`tracker_positions`, `geocercas`, membership variants, attendance variants).
5. Document RPC security contracts per function (required tenant predicates and role assumptions).
6. Document service-role usage boundaries and approved operational contexts.
7. Add a tenant-isolation verification checklist to architecture reviews and release criteria.
8. Add cross-domain examples of safe joins where tenant scope is indirect.

---

## Source Basis

Primary source of truth:

- `docs/DB_SCHEMA_MAP.md`

Supporting references:

- `docs/TABLE_RELATION_DIAGRAM.md`
- `docs/DATA_FLOW.md`
- `docs/RLS_POLICIES.md`
- `docs/DB_OVERVIEW.md`
- `docs/MAPA_TECNICO.md`
