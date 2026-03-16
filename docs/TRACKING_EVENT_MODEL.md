# TRACKING EVENT MODEL

## 1. Purpose

This document describes how tracking data and geofence events are modeled and processed in App Geocercas.

Focus areas:

- GPS position ingestion
- geofence evaluation
- geofence event generation
- current operational state for monitoring

Scope note:

- This is a documentation model, not an implementation change.
- `docs/DB_SCHEMA_MAP.md` is the authoritative source.
- Any non-explicit runtime step is labeled `INFERRED_BEHAVIOR`.

## 2. Tracking Domain Overview

Main tracking tables documented in the system:

- `positions`: canonical enriched GPS position ingestion table (org-scoped).
- `tracker_assignments`: canonical tracker-to-geofence/activity assignment table.
- `tracker_geofence_events`: event table for geofence transitions (`ENTER/EXIT`).
- `tracker_logs`: canonical live-tracking history structure for map/monitoring contexts.
- `tracker_latest`: canonical latest-known position/state structure per user.

Legacy compatibility:

- `tracker_positions`: older/basic tracker position model still present in compatibility paths.

Important boundary note:

- `org_id` is the dominant tenant boundary in canonical tracking tables.

## 3. Core Tracking Entities

### Tracker Device

The tracker device is the GPS source that emits position samples.

Representation in the documented model is indirect:

- positions are linked through user-level identity fields (`user_id`) and assignment/person context (`personal_id`, `asignacion_id` where available).
- there is no separate dedicated "device inventory" table documented as canonical in `DB_SCHEMA_MAP.md`.

### Tracker Assignment

Documented table:

- `tracker_assignments`

Documented role:

- associates trackers with geofence and activity context over active date/time windows.
- includes `org_id`, `tracker_user_id`, `geofence_id`, `activity_id`, temporal range fields, and active/frequency flags.

Association interpretation:

- user linkage: documented via `tracker_user_id`.
- organization linkage: documented via `org_id`.
- geofence/activity linkage: documented via `geofence_id` and `activity_id`.
- relationship to `personal` entities exists logically in the broader model but exact runtime mapping steps are `INFERRED_BEHAVIOR`.

### Position Records

Documented table:

- `positions`

Documented role:

- stores canonical GPS samples enriched with organization and operational context.

Documented fields include:

- `org_id`, `user_id`, `personal_id`, `asignacion_id`
- `lat`, `lng`, `recorded_at`
- metadata such as `source`, `battery`, `is_mock`

Model responsibility:

- `positions` is the primary input dataset for geofence event evaluation.

### Geofence Event Records

Documented table:

- `tracker_geofence_events`

Documented role:

- stores geofence transition events for tracking (`ENTER/EXIT` documented).

Documented fields include:

- `org_id`, `user_id`, `personal_id`
- `geocerca_id`, `geocerca_nombre`, `event_type`
- `lat`, `lng`, `source`, `created_at`

Documented FK:

- `tracker_geofence_events.geocerca_id -> geofences.id`

Naming inconsistency (documented):

- column name uses `geocerca_id` while FK points to canonical `geofences.id`.

### Latest State Records

Documented table:

- `tracker_latest`

Documented role:

- described as latest point/state per user for live map visibility.

`INFERRED_BEHAVIOR`:

- exact update strategy (trigger, function, batch, or service flow) is not explicitly documented in schema docs.

## 4. High-Level Tracking Pipeline

Likely tracking pipeline at model level:

1. GPS source emits coordinates.
2. Tracking ingestion receives sample. `INFERRED_BEHAVIOR`
3. Tracker context is resolved against assignment/org scope (`tracker_assignments`) where applicable. `INFERRED_BEHAVIOR`
4. Canonical position is stored in `positions`.
5. Geofence evaluation is performed against geofence model (`geofences` and legacy coexistence context where relevant). `INFERRED_BEHAVIOR`
6. Transition events are persisted in `tracker_geofence_events`.
7. Current state is exposed through `tracker_latest` and/or recent tracking structures (`tracker_logs`, recent `positions`).

## 5. Geofence Evaluation Model

Conceptual geofence evaluation responsibilities in the documented model:

1. position record received (`positions`)
2. relevant active geofences resolved for tenant/assignment context (`geofences`, possibly compatibility with `geocercas`)
3. spatial intersection determination for current sample `INFERRED_BEHAVIOR`
4. transition decision (inside/outside change) `INFERRED_BEHAVIOR`
5. event persistence to `tracker_geofence_events`

Model boundaries:

- The data model documents involved tables and keys.
- The exact geometric algorithm/function sequence is not explicitly documented and remains `INFERRED_BEHAVIOR`.

## 6. Event Generation Logic

Documented event semantics:

- `ENTER`
- `EXIT`

`INFERRED_BEHAVIOR` conceptual rules:

- first detected inside-state after outside/no-state can generate entry event
- detected outside-state after inside-state can generate exit event

Potential optional semantics:

- presence/dwell style events are not explicitly documented in `DB_SCHEMA_MAP.md`; treat as `INFERRED_BEHAVIOR` if implemented elsewhere.

Persistence responsibility:

- event records are stored in `tracker_geofence_events` with org/user/personal/geofence context and event metadata.

## 7. Assignment Influence on Tracking

Assignment-related tables in this context:

- `tracker_assignments`
- `asignaciones`
- `activities`
- `personal`

Documented influence:

- `tracker_assignments` defines tracker-to-geofence/activity operational windows.
- `asignaciones` links person/geofence/activity with temporal and status information in the operational domain.
- `activities` provides activity catalog context for assignment and reporting.
- `personal` provides operational person linkage per organization.

`INFERRED_BEHAVIOR`:

- precise precedence rules between `tracker_assignments` and `asignaciones` in runtime event evaluation are not explicitly documented.
- exact rule for choosing "active assignment" at event time is not explicitly documented.

## 8. Current State and Operational Visibility

The monitoring layer likely composes current operational state from:

- `tracker_latest` for latest per-tracker state
- recent `positions` for trajectory/history context
- recent `tracker_geofence_events` for transition timeline
- `tracker_logs` for additional live tracking history context

Supported interfaces (model-level intent):

- map views
- tracker dashboards
- operational monitoring screens

`INFERRED_BEHAVIOR`:

- exact read-priority order between `tracker_latest`, `tracker_logs`, and direct `positions` is not strictly documented.

## 9. Event Duplication Risks

Potential duplication/inconsistency risks in this model (not confirmed incidents):

- repeated high-frequency position samples near a geofence boundary may trigger rapid transition toggling. `INFERRED_BEHAVIOR`
- missing prior-state continuity can produce repeated `ENTER` or repeated `EXIT`. `INFERRED_BEHAVIOR`
- overlapping geofences may produce multiple events for a single position sample. `INFERRED_BEHAVIOR`
- reconnect/retry sequences may re-submit positions and duplicate transition calculations. `INFERRED_BEHAVIOR`
- coexistence of canonical and legacy position paths (`positions` + `tracker_positions`) can increase reconciliation complexity.

Model mitigation direction (documentation-level):

- maintain a single canonical path for new development (`positions`, `tracker_assignments`, `tracker_geofence_events`, `tracker_latest`) and treat legacy paths as compatibility only.

## 10. Legacy Tracking Model

Legacy tracking component documented:

- `tracker_positions`

Documented role:

- basic GPS position storage (`user_id`, `geocerca_id`, `latitude`, `longitude`, `accuracy`, `speed`, `created_at`).

Coexistence status:

- canonical model uses `positions`.
- legacy compatibility still exists and appears in historical/compatibility flows.

Architecture guidance from source docs:

- prefer canonical model for ongoing development.
- treat legacy tables as transition surfaces requiring explicit compatibility handling.

## 11. Tracking Data Flow Diagram

```mermaid
flowchart TD
  device[GPS Device]
  ingest[Tracking Ingestion\nINFERRED_BEHAVIOR]
  assign[tracker_assignments\n(org/tracker/geofence/activity)]
  pos[positions\n(canonical GPS samples)]
  eval[Geofence Evaluation\nINFERRED_BEHAVIOR]
  events[tracker_geofence_events\n(ENTER/EXIT)]
  latest[tracker_latest\n(latest known state)]
  logs[tracker_logs\n(live tracking history)]
  legacy[tracker_positions\n(legacy compatibility)]

  device --> ingest
  ingest --> pos
  assign --> pos
  pos --> eval
  eval --> events
  pos --> latest
  pos --> logs
  events --> latest
  legacy -. compatibility path .-> eval
```
