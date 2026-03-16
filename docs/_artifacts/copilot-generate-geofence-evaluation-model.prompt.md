You are documenting the **geofence evaluation model** for the project **App Geocercas**.

Your task is to create or replace:

docs/GEOFENCE_EVALUATION_MODEL.md

This is a **documentation-only task**.

Do NOT:

* modify application code
* generate SQL
* create migrations
* modify Supabase policies
* modify runtime logic

You are only producing **technical documentation describing how geofence evaluation works conceptually in the system**.

---

# SOURCE OF TRUTH

Primary source:

docs/DB_SCHEMA_MAP.md

Supporting documentation:

docs/DATA_FLOW.md
docs/TABLE_RELATION_DIAGRAM.md
docs/TRACKING_EVENT_MODEL.md
docs/RLS_POLICIES.md
docs/SECURITY_AUDIT.md

If documentation conflicts, **DB_SCHEMA_MAP.md is authoritative**.

Do NOT invent:

* new tables
* new services
* new queues
* new workers
* undocumented algorithms

If behavior is not explicitly documented, label it:

INFERRED_BEHAVIOR

---

# PROJECT CONTEXT

App Geocercas is a **territorial control SaaS** with:

* GPS tracking
* geofences
* personnel assignments
* operational activities
* event detection for entry/exit of zones

Main schema domains relevant to geofence evaluation:

positions
tracker_assignments
tracker_geofence_events

Territorial configuration:

geofences
geocercas (legacy)

Operational context:

personal
asignaciones
activities

---

# DOCUMENT GOAL

Explain how the system likely determines when a tracked entity:

* enters a geofence
* exits a geofence
* remains inside a geofence

The document must help developers understand:

* spatial evaluation flow
* event generation logic
* potential duplication risks
* interaction with assignments and activities

---

# REQUIRED DOCUMENT STRUCTURE

# GEOFENCE EVALUATION MODEL

## 1. Purpose

Explain that this document describes the **conceptual model used to detect geofence events from GPS positions**.

Clarify that the document focuses on:

* spatial evaluation
* event generation
* assignment context
* interaction with tracking pipeline

---

## 2. Geofence Domain Overview

Describe the geofence domain:

geofences
geocercas (legacy compatibility)

Explain that geofences represent spatial zones used to detect operational events.

Clarify that both models may coexist during transition.

---

## 3. Inputs to Geofence Evaluation

Explain the primary inputs used for evaluation.

### Position Records

Table:

positions

Each record represents a GPS sample including:

latitude
longitude
timestamp

Positions are the primary trigger for geofence evaluation.

---

### Assignment Context

Tables:

asignaciones
activities
personal

Assignments may determine:

which geofence is relevant
which activity is active
which person is responsible

If exact rules are undocumented, mark as inferred.

---

### Geofence Definitions

Table:

geofences

Each geofence defines a spatial boundary used for evaluation.

Legacy support may include:

geocercas

---

## 4. High-Level Geofence Evaluation Flow

Explain the conceptual pipeline:

position received
↓
candidate geofences resolved
↓
spatial intersection test
↓
previous state comparison
↓
event generation
↓
event persistence

Clearly mark spatial logic as **conceptual unless documented**.

---

## 5. Spatial Evaluation Concept

Explain that geofence detection typically requires a spatial test such as:

point-in-polygon

However, do NOT claim specific GIS libraries or functions unless documented.

Focus on conceptual logic:

position inside geofence
position outside geofence

---

## 6. Event Detection Model

Explain how events are conceptually derived.

Typical logic:

First position inside zone → ENTRY event
Position outside after inside → EXIT event

Possible event types:

ENTRY
EXIT
PRESENCE / DWELL (if supported)

Label exact event rules as **INFERRED_BEHAVIOR** if not explicitly documented.

---

## 7. State Comparison Logic

Explain that event generation usually requires comparing:

current position state
previous known state

Possible sources for previous state:

tracker_latest
previous geofence events

Mark implementation details as inferred if undocumented.

---

## 8. Event Persistence

Document the event table:

tracker_geofence_events

Explain that it stores detected geofence transitions.

Include the documented relationship:

tracker_geofence_events.geocerca_id -> geofences.id

Mention legacy naming if applicable.

---

## 9. Overlapping Geofence Scenarios

Explain possible scenarios such as:

multiple geofences overlapping
nested zones
simultaneous entry into multiple zones

Explain that event handling in these cases may require additional logic.

Mark rules as inferred if undocumented.

---

## 10. Event Duplication Risks

Explain common causes of duplicate events:

rapid GPS updates
jitter near geofence boundary
device reconnect events
overlapping geofences

Explain why deduplication logic is important.

---

## 11. Geofence Evaluation Diagram

Add a Mermaid diagram illustrating the evaluation flow.

Example structure:

flowchart TD
positions --> geofence_candidate_resolution
geofence_candidate_resolution --> spatial_intersection
spatial_intersection --> state_comparison
state_comparison --> tracker_geofence_events
tracker_geofence_events --> tracker_latest

Mark logical steps clearly.

---

## 12. Architectural Observations

Summarize key insights:

event-driven evaluation model
assignment-aware geofence logic
coexistence of geofences and geocercas
tracking pipeline integration

---

## 13. Documentation Gaps

List areas where documentation is incomplete.

Examples:

exact spatial algorithm
deduplication logic
assignment resolution rules
overlap handling strategy

---

## 14. Future Improvements

Recommend documentation improvements only.

Examples:

document geofence geometry format
document evaluation triggers
document deduplication rules
document event processing latency expectations

---

# STYLE RULES

Write in clear technical English.

Prefer concise architecture explanations.

Avoid speculation unless clearly marked as:

INFERRED_BEHAVIOR

---

# CRITICAL RULES

1. Do not invent system behavior.
2. Respect DB_SCHEMA_MAP.md as authoritative.
3. Distinguish documented vs inferred logic.
4. Modify only:

docs/GEOFENCE_EVALUATION_MODEL.md

---

# OUTPUT

Generate a complete documentation file at:

docs/GEOFENCE_EVALUATION_MODEL.md
