GEOFENCE_ENGINE_ARCHITECTURE.md
1. Purpose

This document defines the architecture of the Geofence Evaluation Engine used by App Geocercas.

The engine is responsible for detecting:

tracker ENTRY into geofences

tracker EXIT from geofences

based on incoming GPS positions.

The goal of this document is to define:

the conceptual engine workflow

the data objects involved

event generation rules

duplication protection

performance constraints

future scalability considerations

This document does not define runtime code or SQL implementation.

2. Engine Role in the Tracking System

The geofence engine is part of the canonical tracking pipeline:

tracker_assignments
        ↓
positions
        ↓
GEOFENCE ENGINE
        ↓
tracker_geofence_events
        ↓
tracker_latest

The engine evaluates incoming positions against geofence geometry and generates semantic events.

3. Core Engine Responsibilities

The engine performs five core responsibilities:

Receive a position record.

Identify relevant geofences for evaluation.

Perform spatial intersection tests.

Compare the result with the previous tracker state.

Generate events when state transitions occur.

4. Canonical Data Inputs

The engine uses the following canonical objects.

Position input
positions

Relevant fields:

org_id

user_id

personal_id

lat

lng

recorded_at

Geofence geometry
geofences

Important fields:

id

org_id

geom (PostGIS geometry)

active

bbox

lat/lng/radius_m (for circular geofences)

Tracker operational context
tracker_assignments

This table defines:

which tracker belongs to which geofence

activity context

operational time window

5. Candidate Geofence Selection

Before performing spatial intersection tests, the engine should limit the number of geofences evaluated.

Candidate filtering may include:

organization match

active geofences

time-window constraints

tracker assignments

bounding box proximity

Purpose:

Reduce spatial evaluation workload.

6. Spatial Evaluation

Once candidates are identified, spatial intersection is evaluated.

Conceptual operations:

POINT(lat,lng) ∈ GEOMETRY(geofence)

Possible evaluation cases:

Polygon geofence
ST_Intersects(point, geom)
Circular geofence

Distance test:

distance(point, center) ≤ radius

The engine must support both shapes.

7. State Comparison

The engine must compare current spatial state with previous tracker state.

Possible states:

State	Meaning
OUTSIDE	tracker outside geofence
INSIDE	tracker inside geofence

Transitions:

Previous	Current	Event
OUTSIDE	INSIDE	ENTER
INSIDE	OUTSIDE	EXIT

If state does not change:

NO EVENT
8. Event Generation

When a state transition occurs, an event must be persisted.

Target table:

tracker_geofence_events

Event types:

ENTER
EXIT

Typical event attributes:

org_id

user_id

personal_id

geocerca_id (FK → geofences.id)

lat

lng

created_at

event_type

These events represent semantic movement behavior.

9. Duplicate Event Protection

Tracking systems must protect against duplicate events caused by GPS jitter.

Example problem:

ENTER
EXIT
ENTER
EXIT

within seconds.

Mitigation strategies include:

previous state comparison

minimal distance threshold

minimal time threshold

smoothing logic

Event generation must only occur when state change is confirmed.

10. Overlapping Geofences

Multiple geofences may overlap geographically.

Possible scenarios:

scenario	description
Nested	one geofence inside another
Adjacent	borders touching
Overlapping	partial overlap

Possible outcomes:

tracker inside multiple geofences

simultaneous ENTER events

The engine must support multi-geofence membership.

Each geofence state must be tracked independently.

11. Missing Position Scenarios

The engine must handle incomplete tracking sequences.

Examples:

GPS signal loss

device offline

skipped updates

Possible effects:

delayed EXIT detection

missing transitions

Event detection should remain statelessly recoverable from next position.

12. Performance Strategy

Geofence evaluation must scale to large volumes of positions.

Key performance principles:

minimize candidate geofence set

use spatial indexes

avoid full-table scans

evaluate only relevant organization geofences

rely on bounding box filtering

Spatial indexing strategy must be documented separately.

13. Engine Execution Model

The evaluation engine may run in several ways.

Possible implementations:

database trigger

background worker

server-side job

event processing service

The architecture document does not mandate a specific runtime.

However, the engine must ensure:

deterministic event generation

idempotent processing

resilience to retries

14. Engine Failure Recovery

To maintain reliability:

The system should support recovery scenarios:

position reprocessing

event backfill

re-evaluation of historical positions

This requires:

immutable position history

deterministic evaluation rules

15. Interaction with tracker_latest

After evaluation, the system must update tracker state.

tracker_latest

should contain:

last known position

current geofence state

last update timestamp

This table powers:

live maps

dashboards

operational monitoring

16. Future Enhancements

Possible improvements to the engine:

geofence priority rules

dwell time detection

zone-based alerts

route compliance detection

anomaly detection

These features build on the core evaluation engine.

---

## Nota sobre integración frontend

A partir de mayo 2026, la pantalla TrackerDashboard obtiene la lista de geocercas exclusivamente mediante el helper `listGeofences` del módulo `geofencesApi`, en vez de acceder directamente a la tabla `geofences` vía Supabase. Esto permite aplicar lógica de filtrado, normalización y futuras extensiones de negocio desde un solo punto de mantenimiento, y desacopla la UI de detalles de persistencia.

Para detalles, ver la función `fetchGeofences` en TrackerDashboard.jsx.