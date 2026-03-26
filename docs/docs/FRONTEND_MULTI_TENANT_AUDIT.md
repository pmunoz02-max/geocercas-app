# FRONTEND MULTI-TENANT AUDIT

## 1. Purpose

This document audits frontend data-access patterns in App Geocercas for tenant-isolation safety.

Scope:

- React/Vite frontend code using Supabase client calls.
- Query patterns (`from/select/insert/update/delete/upsert/rpc`) and frontend data-flow assumptions.
- Tenant isolation expectation defined by `organizations`, `memberships`, and `org_id` architecture.

Goal:

- detect patterns that may expose data across organizations
- classify risk as `CONFIRMED_RISK`, `POTENTIAL_RISK`, `DOCUMENTATION_GAP`, or `SAFE_PATTERN`

This is an audit-only document. No refactor is performed here.

## 2. Tenant Isolation Model Expected by Frontend

Based on `docs/DB_SCHEMA_MAP.md`, `docs/TABLE_RELATION_DIAGRAM.md`, `docs/DATA_FLOW.md`, `docs/RLS_POLICIES.md`, and `docs/SECURITY_AUDIT.md`, frontend flows should operate with:

- authenticated user context
- active organization context
- membership-bounded access

Expected data boundary:

- `organizations -> memberships -> profiles/users -> org-scoped operational data`

Operational implication for frontend queries:

- reads/writes should be explicitly org-scoped when possible (`org_id`)
- when explicit org filter is not present, query should be routed through trusted views/RPC/context functions that enforce tenant membership
- legacy tables (`geocercas`, `tracker_positions`, `user_organizations`) should be treated as migration/compatibility surfaces and audited carefully

## 3. Files and Modules Audited

### Auth / session / org context

- `src/context/AuthContext.jsx`
- `src/hooks/useCurrentMembership.js`
- `src/lib/ensureUserContext.ts`
- `src/pages/TrackerPage.jsx`

### Organization / membership / invites

- `src/services/orgs.ts`
- `src/services/invitations.ts`
- `src/services/admin.ts`
- `src/lib/adminsApi.js`

### Geofences / territorial config

- `src/services/GeofenceService.js`
- `src/services/geocercasService.js`
- `src/lib/geocercas.js`
- `src/lib/geocercasApi.js`
- `src/components/GeofenceForm.jsx`
- `src/pages/admin/GeocercasV2.jsx`
- `src/shared/GeoMap.jsx`
- `src/api/geofences.js`
- `src/api/geofences.ts`

### Tracking / map / events

- `src/pages/TrackerDashboard.jsx`
- `src/lib/trackerApi.js`
- `src/hooks/useRealtimePositions.js`
- `src/pages/MapaTracking.jsx`
- `src/tracker/trackerSync.js`
- `src/tracker/offlineQueue.js`

### Assignments / activities / attendance / billing

- `src/services/asignaciones.js`
- `src/lib/activityAssignmentsApi.js`
- `src/pages/InvitarTracker.jsx`
- `src/lib/attendance.js`
- `src/lib/offlineQueue.js`
- `src/hooks/useOrgEntitlements.js`
- `src/pages/Billing.jsx`
- `src/lib/costosApi.js`
- `src/pages/CostosPage.jsx`
- `src/pages/CostosDashboardPage.jsx`

### Admin screens

- `src/pages/AdminPanel.jsx`
- `src/pages/AdminPersonal.jsx`

## 4. Query Pattern Analysis

### Finding: Current-org context persisted via RPC in auth flow
File: `src/context/AuthContext.jsx`
Tables: context RPC (`set_current_org`, `rpc_set_current_org`)
Pattern: active org is set server-side during org switch
Tenant expectation: frontend should align session with selected org before org-scoped reads
Risk: `SAFE_PATTERN`
Reasoning: explicit current-org context setup reduces ambiguous tenant scope across subsequent calls.

### Finding: Membership and organization listing through user-scoped views
File: `src/services/orgs.ts`
Tables: `my_memberships`, `members_with_profiles`, `memberships`
Pattern: org list from view; member listing requires `.eq("org_id", orgId)`; member removal matches `(org_id,user_id)`
Tenant expectation: membership-bounded access per org
Risk: `SAFE_PATTERN`
Reasoning: calls use org parameter or user-scoped views, consistent with documented model.

### Finding: Legacy membership fallback path in tracker access
File: `src/pages/TrackerPage.jsx`
Tables: `memberships`, `user_organizations`, `organizations`
Pattern: first checks `memberships`, then falls back to legacy `user_organizations`
Tenant expectation: canonical membership should drive tenant context
Risk: `POTENTIAL_RISK`
Reasoning: legacy fallback widens security surface and depends on consistent RLS parity between canonical and legacy tables.

### Finding: Tracker dashboard uses explicit org filters for core tracking reads
File: `src/pages/TrackerDashboard.jsx`
Tables: `tracker_assignments`, `geofences`, `personal`, `positions`, `tracker_positions`, `tracker_geofence_events`
Pattern: all key reads include `.eq("org_id", currentOrgId)`; fallback to legacy `tracker_positions` maintains org filter
Tenant expectation: org-scoped tracking visibility
Risk: `SAFE_PATTERN`
Reasoning: explicit org filters are present across assignment, geofence, positions, and events flows.

### Finding: Tracking API has unscoped snapshot + broad realtime channel
File: `src/lib/trackerApi.js`
Tables: `tracker_positions` (`POSITIONS_TABLE`)
Pattern: `suscribirsePosiciones()` snapshot query does not enforce `org_id`; realtime channel subscribes with `{ table: tracker_positions }` and no org filter
Tenant expectation: tracking reads should remain org-bounded
Risk: `POTENTIAL_RISK`
Reasoning: function comments assume RLS isolation, but frontend query itself is broad and increases reliance on backend policy correctness.

### Finding: Realtime hook is safe only if caller passes trusted orgId
File: `src/hooks/useRealtimePositions.js`
Tables: `tracker_positions`
Pattern: delegates to `fetchLatest(orgId)` and `subscribeLatest({ orgId })`
Tenant expectation: org-scoped by active org context
Risk: `SAFE_PATTERN`
Reasoning: this hook itself scopes by orgId, but depends on trusted caller context.

### Finding: Legacy map tracking view uses broad reads without visible org scope
File: `src/pages/MapaTracking.jsx`
Tables: `tracker_latest`, `tracker_logs`
Pattern: `.select(...)` from both tables without `.eq("org_id", ...)`; realtime subscription listens to all inserts on `tracker_logs`
Tenant expectation: tracking dashboards should be org-scoped
Risk: `POTENTIAL_RISK`
Reasoning: no frontend tenant predicate is visible and docs mark these tables as underdocumented for tenant-key clarity.

### Finding: Attendance service keyed by user/date, not org
File: `src/lib/attendance.js`
Tables: `asistencias`
Pattern: read/create/update by `user_id`, `fecha`, or `id`; no org filter or org assignment on writes
Tenant expectation: attendance domain should remain org-scoped (docs mark as underconstrained)
Risk: `DOCUMENTATION_GAP`
Reasoning: attendance schema/policies are transitional in docs; frontend does not expose clear org boundary.

### Finding: Offline attendance flush writes to alternate attendance table
File: `src/lib/offlineQueue.js`
Tables: `attendances`
Pattern: offline queue flush inserts attendance-like rows without explicit org field
Tenant expectation: attendance writes should align with canonical tenant model
Risk: `POTENTIAL_RISK`
Reasoning: coexistence of `asistencias` and `attendances` plus missing visible org context is a migration-risk surface.

### Finding: Assignment service uses owner_id optional filter, not org_id
File: `src/services/asignaciones.js`
Tables: `asignaciones`
Pattern: broad `.select("*")`; optional `.eq("owner_id", ownerId)`
Tenant expectation: assignments are org-scoped by architecture
Risk: `POTENTIAL_RISK`
Reasoning: filtering by owner can diverge from tenant boundary (`org_id`) and increases reliance on implicit RLS.

### Finding: Activity assignments service bridges `tenant_id` via `my_org_ids`
File: `src/lib/activityAssignmentsApi.js`
Tables: `my_org_ids`, `activity_assignments`
Pattern: resolves tenant once from `my_org_ids`; queries enforce `.eq("tenant_id", tenantId)` for list/create
Tenant expectation: mixed `tenant_id`/`org_id` compatibility should still preserve tenant scope
Risk: `SAFE_PATTERN`
Reasoning: explicit tenant predicate is present, though mixed key model remains architectural debt.

### Finding: Geofence services are mixed safe/legacy
File: `src/services/GeofenceService.js`, `src/services/geocercasService.js`, `src/lib/geocercas.js`
Tables: `geocercas`, `personal`, `asignaciones`
Pattern: some flows include org filters (`listPersonal`, `listAsignaciones`), others perform global list/get/update/delete by id/name
Tenant expectation: geofence operations should be org-scoped
Risk: `POTENTIAL_RISK`
Reasoning: legacy paths contain broad `geocercas` access patterns with no explicit org filter in several functions.

### Finding: Geofence admin/form pages perform broad `geocercas` reads/writes
File: `src/pages/admin/GeocercasV2.jsx`, `src/components/GeofenceForm.jsx`
Tables: `geocercas`, `geocercas_geojson`
Pattern: list and mutate geofences without explicit org predicate
Tenant expectation: admin geofence operations should still map to active org scope
Risk: `POTENTIAL_RISK`
Reasoning: no visible org-scoping in query layer; safety depends entirely on backend enforcement and undocumented view constraints.

### Finding: GeoMap fallback reads legacy table by id without org check
File: `src/shared/GeoMap.jsx`
Tables: `geocercas_feature`, `geocercas`
Pattern: loads geofence by `id` route/query param; no active-org check
Tenant expectation: record lookup should not cross org boundaries
Risk: `POTENTIAL_RISK`
Reasoning: direct object-by-id lookup without org context can be sensitive if RLS/view rules are not strict.

### Finding: Cost and billing flows generally org-scoped
File: `src/lib/costosApi.js`, `src/pages/CostosPage.jsx`, `src/pages/CostosDashboardPage.jsx`, `src/hooks/useOrgEntitlements.js`, `src/pages/Billing.jsx`
Tables: `org_billing`, `org_entitlements`, `v_costos_detalle`, `activities`, `personal`, `geocercas`
Pattern: read APIs pass/require `org_id` or current org context; some compatibility fallback to `tenant_id`
Tenant expectation: billing/cost data should be org-bounded
Risk: `SAFE_PATTERN`
Reasoning: dominant query style includes org scoping, with explicit compatibility handling for legacy keying.

### Finding: Admin panel performs broad organization/profile listing
File: `src/pages/AdminPanel.jsx`
Tables: `profiles`, `roles`, `organizations`
Pattern: full-table selects with no org filter and no visible role gate in component
Tenant expectation: admin scope should be explicitly constrained and documented
Risk: `POTENTIAL_RISK`
Reasoning: broad reads may be valid for super-admin but this behavior is not documented in tenant architecture docs.

### Finding: Admin personal relies on high-privilege RPCs and broad geofence list
File: `src/pages/AdminPersonal.jsx`
Tables: RPC `f_admin_personal`, `rpc_admin_assign_geocerca`, `rpc_admin_upsert_phone`; table `geocercas`
Pattern: privileged RPC surface + geofence listing without explicit org filter
Tenant expectation: administrative operations must enforce strict tenant boundaries server-side
Risk: `DOCUMENTATION_GAP`
Reasoning: frontend cannot verify RPC internals; docs do not provide per-RPC tenant guarantees.

## 5. High-Risk Query Patterns to Detect

### A. Broad table reads

Observed:

- `src/pages/AdminPanel.jsx`: broad `profiles`, `roles`, `organizations` reads.
- `src/pages/admin/GeocercasV2.jsx`: broad geofence list across `geocercas`.
- `src/components/GeofenceForm.jsx`: broad `geocercas_geojson` load.
- `src/pages/MapaTracking.jsx`: broad `tracker_latest` and `tracker_logs` reads.

Classification: mostly `POTENTIAL_RISK`.

### B. Weak tenant filtering

Observed:

- `src/services/asignaciones.js`: optional `owner_id` filtering on org-scoped domain.
- `src/lib/attendance.js`: attendance keyed by `user_id` and date without visible org predicate.

Classification: `POTENTIAL_RISK` / `DOCUMENTATION_GAP`.

### C. Legacy table usage

Observed:

- `geocercas` across multiple modules (`GeofenceService`, `GeocercasV2`, `GeofenceForm`, `GeoMap`, `lib/geocercas.js`).
- `tracker_positions` fallback and canonical usage in tracking utilities (`TrackerDashboard`, `trackerApi`, `trackerSync`).
- `user_organizations` in tracker/org/admin flows.

Classification: `POTENTIAL_RISK` due to coexistence complexity.

### D. Unsafe nested selects or joins

Observed:

- No large multi-table client-side join chains were detected.
- Risk remains in view-based access (`members_with_profiles`, `geocercas_feature`, `v_costos_detalle`) where tenant guarantees are server-defined.

Classification: `DOCUMENTATION_GAP` for view internals.

### E. RPC usage with unclear tenant safety

Observed RPCs:

- org context/membership: `set_current_org`, `rpc_set_current_org`, `ensure_user_context`, `invite_member`, `accept_invitation`, `cancel_invitation`, `set_member_role`
- admin: `f_admin_personal`, `rpc_admin_assign_geocerca`, `rpc_admin_upsert_phone`, `admins_list`, `admins_remove`, `admin_assign_role_org`
- tracking/costos: `resolve_org_for_tracker_dashboard`, `get_current_org_id`, `get_costos_asignaciones_v2`, `get_costos_asignaciones`, `rpc_crear_geocerca`

Classification: mostly `DOCUMENTATION_GAP` unless explicit org parameter + known membership check is present.

### F. Writes without strong tenant context

Observed:

- `src/api/geofences.js`: insert into `geofences` without visible `org_id` in payload.
- `src/components/GeofenceForm.jsx` and `src/pages/admin/GeocercasV2.jsx`: inserts/updates/deletes on `geocercas` without explicit org field.
- `src/lib/offlineQueue.js`: inserts into `attendances` without visible org context.

Classification: `POTENTIAL_RISK`.

### G. Admin screens with broad access

Observed:

- `src/pages/AdminPanel.jsx` broad selects.
- `src/pages/AdminPersonal.jsx` privileged RPC/admin actions.

Classification: `POTENTIAL_RISK` / `DOCUMENTATION_GAP`.

## 6. Safe Patterns Identified

- `src/context/AuthContext.jsx`: sets active org via RPC before dependent operations. `SAFE_PATTERN`.
- `src/services/orgs.ts`: org list via `my_memberships`, members by explicit `org_id`, membership mutation by `(org_id,user_id)`. `SAFE_PATTERN`.
- `src/pages/TrackerDashboard.jsx`: explicit `.eq("org_id", currentOrgId)` across assignments, geofences, positions, and geofence events. `SAFE_PATTERN`.
- `src/hooks/useOrgEntitlements.js` and `src/pages/Billing.jsx`: billing and entitlement reads scoped by `currentOrgId`. `SAFE_PATTERN`.
- `src/lib/costosApi.js`: RPCs require `p_org_id`, no query when org is missing. `SAFE_PATTERN`.
- `src/lib/activityAssignmentsApi.js`: resolves tenant from `my_org_ids`, enforces `.eq("tenant_id", tenantId)`. `SAFE_PATTERN`.

## 7. Risk by Domain

### Identity / Membership

Main query style:

- view-based (`my_memberships`, `v_current_membership`) + membership table filters.

Main risk level:

- Low to Medium.

Notes:

- mostly aligned with intended architecture; legacy `user_organizations` fallback remains a transitional risk.

### Geofences / Territorial config

Main query style:

- mixed canonical/legacy (`geofences` and `geocercas`) with significant direct table access.

Main risk level:

- Medium.

Notes:

- several pages mutate/list geofences without explicit org predicates.

### Tracking

Main query style:

- explicit org filters in `TrackerDashboard`, mixed with unscoped utility/map queries.

Main risk level:

- High.

Notes:

- `trackerApi.suscribirsePosiciones` and `MapaTracking` rely heavily on implicit backend isolation.

### Assignments / Activities

Main query style:

- assignment APIs use mixed keying (`org_id`, `owner_id`, `tenant_id`).

Main risk level:

- Medium.

Notes:

- `asignaciones` service uses `owner_id` filtering in an org-scoped domain.

### Attendance

Main query style:

- direct table CRUD (`asistencias`) and offline writer to `attendances`.

Main risk level:

- Medium.

Notes:

- docs mark attendance as transitional/underdocumented; frontend does not show clear org boundary in these flows.

### Billing

Main query style:

- explicit current-org filters and RPC org arguments.

Main risk level:

- Low.

Notes:

- mostly consistent with expected tenant model.

### Legacy compatibility

Main query style:

- fallback and coexistence across `geocercas`, `tracker_positions`, `user_organizations`, `tenant_id`.

Main risk level:

- Medium to High (depending on endpoint/view policy parity).

Notes:

- architecture-doc alignment exists, but code still traverses multiple compatibility layers.

## 8. RPC and Special Access Surface

### Visible tenant safety

- `set_current_org` / `rpc_set_current_org` in `src/context/AuthContext.jsx`: active-org context persistence is explicit.
- `get_costos_asignaciones_v2` and fallback `get_costos_asignaciones` in `src/lib/costosApi.js`: explicit `p_org_id` argument.
- `invite_member` / `accept_invitation` / `cancel_invitation` in `src/services/invitations.ts`: org/token-scoped API shape is visible.

Classification: mostly `SAFE_PATTERN`.

### Assumed tenant safety

- `resolve_org_for_tracker_dashboard`, `get_current_org_id` in `src/pages/TrackerDashboard.jsx`: org resolution is RPC-owned.
- `get_my_profile` in `src/hooks/useUserProfile.js`: profile scoping delegated to RPC.
- `rpc_crear_geocerca` in `src/services/geocercasService.js`: tenant constraints are server-owned.

Classification: `DOCUMENTATION_GAP`.

### Unclear / high-privilege surfaces

- `f_admin_personal`, `rpc_admin_assign_geocerca`, `rpc_admin_upsert_phone` in `src/pages/AdminPersonal.jsx`.
- `admins_list`, `admins_remove`, and edge-function admin invites in `src/lib/adminsApi.js`.

Classification: `DOCUMENTATION_GAP` (and `POTENTIAL_RISK` when combined with broad UI access patterns).

## 9. Highest Priority Findings

Finding | File/Area | Domain | Severity | Classification | Confidence
------- | --------- | ------ | -------- | -------------- | ----------
Unscoped tracker snapshot/realtime channel in `suscribirsePosiciones` | `src/lib/trackerApi.js` | Tracking | High | POTENTIAL_RISK | LIKELY
Broad tracking reads/subscription without org filter | `src/pages/MapaTracking.jsx` | Tracking | High | POTENTIAL_RISK | LIKELY
Broad admin table reads (`profiles`, `organizations`) | `src/pages/AdminPanel.jsx` | Identity/Admin | High | POTENTIAL_RISK | LIKELY
Legacy geofence CRUD/list without explicit org predicates | `src/pages/admin/GeocercasV2.jsx`, `src/components/GeofenceForm.jsx` | Geofences | Medium | POTENTIAL_RISK | LIKELY
Assignment service filtering by `owner_id` in org domain | `src/services/asignaciones.js` | Assignments | Medium | POTENTIAL_RISK | LIKELY
Attendance writes/reads without visible org context across variant tables | `src/lib/attendance.js`, `src/lib/offlineQueue.js` | Attendance | Medium | DOCUMENTATION_GAP | INFERRED
Privileged admin RPC surface with undocumented tenant guarantees | `src/pages/AdminPersonal.jsx`, `src/lib/adminsApi.js` | Admin/RPC | Medium | DOCUMENTATION_GAP | INFERRED
Tracker dashboard explicit org-scoped queries | `src/pages/TrackerDashboard.jsx` | Tracking | Low | SAFE_PATTERN | CONFIRMED

## 10. Recommended Refactor Targets

Documentation-level recommendations only:

- Centralize tenant-scoped query helpers for tracking reads (`tracker_positions`, `tracker_logs`, `tracker_latest`) so org filtering is mandatory in client code paths.
- Define and document a canonical frontend contract for legacy tables (`geocercas`, `tracker_positions`, `user_organizations`) including accepted fallback behavior and deprecation path.
- Require explicit tenant context in all write paths where feasible, especially geofence and attendance flows.
- Replace owner-based or user-only filters in org-scoped domains with explicit org-bound predicates where architecture expects `org_id`.
- Add per-RPC security notes in docs (expected input, tenant guard, role guard) for admin and tracking RPCs.
- Add audit comments in risky modules indicating where frontend depends fully on RLS/view/RPC internals.

## 11. Copilot Refactor Queue

1. `src/lib/trackerApi.js` - high-impact tracking utility with unscoped snapshot/realtime path that can affect multiple screens.
2. `src/pages/MapaTracking.jsx` - broad reads and subscriptions on `tracker_latest`/`tracker_logs` with no visible org filtering.
3. `src/pages/AdminPanel.jsx` - broad admin reads of `profiles` and `organizations` without visible tenant gate.
4. `src/pages/admin/GeocercasV2.jsx` - legacy geofence CRUD/list paths missing explicit tenant predicates.
5. `src/components/GeofenceForm.jsx` - direct legacy geofence mutations and broad geofence_geojson loading.
6. `src/services/asignaciones.js` - org domain queried with owner-based filter pattern.
7. `src/lib/attendance.js` - attendance reads/writes rely on user/date only in an underdocumented tenant domain.
8. `src/lib/offlineQueue.js` - offline writer to `attendances` without explicit org context.
9. `src/pages/AdminPersonal.jsx` - privileged RPC calls require explicit tenant-safety documentation and role-gating review.
10. `src/services/admin.ts` - direct `user_organizations` fallback and organization-level mutations in legacy compatibility path.

## 12. Files Most Likely to Need Refactor First

Top 5 frontend files ranked by likelihood of tenant-isolation mistakes, based on observed Supabase query patterns:

1. `src/lib/trackerApi.js` - highest risk because `suscribirsePosiciones()` performs broad `tracker_positions` snapshot/realtime access without explicit `org_id` scoping in that path.
2. `src/pages/MapaTracking.jsx` - reads `tracker_latest` and `tracker_logs` without visible organization filters and subscribes to all `tracker_logs` inserts.
3. `src/pages/AdminPanel.jsx` - performs broad `.from("profiles").select(...)` and `.from("organizations").select("*")` without tenant predicates in component query logic.
4. `src/pages/admin/GeocercasV2.jsx` - legacy `geocercas` CRUD/listing is done without explicit org filter, increasing reliance on implicit backend controls.
5. `src/components/GeofenceForm.jsx` - broad geofence loading (`geocercas_geojson`) and direct `geocercas` create/update/delete flows without explicit org-scoped predicates.
