You are documenting the **tracking and geofence event model** of the project **App Geocercas**.

Your task is to create or replace:

docs/TRACKING_EVENT_MODEL.md

This is a **documentation-only task**.

Do NOT:

- modify code
- generate SQL
- create migrations
- change Supabase policies
- change application logic

You are only producing **technical documentation describing how the tracking system works**.

---

# SOURCE OF TRUTH

Primary documentation:

docs/DB_SCHEMA_MAP.md

Supporting documents:

docs/DATA_FLOW.md  
docs/TABLE_RELATION_DIAGRAM.md  
docs/RLS_POLICIES.md  
docs/SECURITY_AUDIT.md  
docs/TRACKER_SYSTEM.md (if present)

If documentation conflicts, **DB_SCHEMA_MAP.md is authoritative**.

Do NOT invent:

- new tables
- new services
- new ingestion systems
- new queues
- new workers

If behavior is not documented, label it as:

INFERRED_BEHAVIOR

---

# PROJECT CONTEXT

App Geocercas is a **territorial control SaaS platform** using:

Frontend:
- React
- Vite
- Leaflet
- Tailwind

Backend:
- Supabase
- PostgreSQL
- RLS

Key operational capability:

GPS tracking with **geofence event detection**.

Main tracking-related tables documented in the system:

tracker_assignments  
positions  
tracker_geofence_events  
tracker_logs  
tracker_latest  

Legacy compatibility may include:

tracker_positions

Territorial domain:

geofences  
geocercas (legacy)

Operational assignment domain:

personal  
asignaciones  
activities  

---

# DOCUMENT GOAL

Describe clearly:

- how GPS positions move through the system
- how geofence events are generated
- how assignments influence tracking behavior
- how current state is maintained
- where legacy systems coexist

The document must help developers understand:

- event generation logic
- tracking pipeline structure
- potential sources of event duplication
- data model responsibilities

---

# REQUIRED DOCUMENT STRUCTURE

---

# TRACKING EVENT MODEL

## 1. Purpose

Explain that this document describes how **tracking data and geofence events are modeled and processed** in App Geocercas.

Clarify that the document focuses on:

- GPS position ingestion
- geofence evaluation
- event generation
- current operational state

---

## 2. Tracking Domain Overview

Describe the main tables involved in tracking:

positions  
tracker_assignments  
tracker_geofence_events  
tracker_logs  
tracker_latest  

Explain the role of each table in simple terms.

Do not claim behaviors not supported by documentation.

---

## 3. Core Tracking Entities

Explain key entities involved in tracking.

### Tracker Device

Represents the GPS source.

If device representation is indirect (through assignments), explain accordingly.

---

### Tracker Assignment

Document:

tracker_assignments

Explain how trackers become associated with:

users  
personal entities  
organizations  
activities  
geofences

If exact mapping is unclear, mark as inferred.

---

### Position Records

Document:

positions

Explain that each position record represents a GPS sample with coordinates and timestamp.

Mention that position records are the **primary input for geofence evaluation**.

---

### Geofence Event Records

Document:

tracker_geofence_events

Explain that this table stores events such as:

entry  
exit  
presence (if applicable)

Include the documented FK relationship:

tracker_geofence_events.geocerca_id -> geofences.id

Mention naming inconsistency if present.

---

### Latest State Records

Document:

tracker_latest

Explain that this table likely stores the **latest known tracker state** for efficient access.

Mark as INFERRED_BEHAVIOR if not explicitly documented.

---

## 4. High-Level Tracking Pipeline

Describe the likely flow of tracking data through the system.

Typical shape:

GPS device  
↓  
tracking ingestion  
↓  
tracker_assignments lookup  
↓  
positions stored  
↓  
geofence evaluation  
↓  
tracker_geofence_events generated  
↓  
tracker_latest updated

Clearly label any step not documented as inferred.

---

## 5. Geofence Evaluation Model

Explain how geofence detection likely works conceptually.

Steps may include:

position received  
↓  
active geofences resolved  
↓  
spatial intersection check  
↓  
entry / exit logic  
↓  
event persistence

Do not invent spatial algorithms or PostGIS functions unless documented.

Focus on data model responsibilities.

---

## 6. Event Generation Logic

Explain how events are likely produced.

Possible event types:

entry  
exit  
presence / dwell

Describe common event rules conceptually:

first position inside geofence → entry  
position outside after inside → exit

Mark exact rules as INFERRED_BEHAVIOR unless documented.

---

## 7. Assignment Influence on Tracking

Explain how assignments affect tracking.

Tables involved:

asignaciones  
activities  
personal  

Explain that assignments may define:

which geofence is relevant  
which activity is active  
which person is responsible

If behavior is not explicit, label as inferred.

---

## 8. Current State and Operational Visibility

Explain how the system likely exposes current operational state.

Possible mechanisms:

tracker_latest  
recent positions  
recent geofence events

Explain that this layer supports:

maps  
dashboards  
monitoring interfaces.

---

## 9. Event Duplication Risks

Explain potential causes of duplicate or inconsistent events.

Examples:

multiple position updates in same zone  
missing exit detection  
overlapping geofences  
tracker reconnect events

Do not claim confirmed issues unless documented.

---

## 10. Legacy Tracking Model

Document legacy tracking components.

Example:

tracker_positions

Explain how legacy tables may coexist with the modern pipeline.

Clarify that new development should prefer canonical models if documented.

---

## 11. Tracking Data Flow Diagram

Add a Mermaid diagram showing the tracking pipeline.

Example structure:

```mermaid
flowchart TD
device --> tracker_assignments
tracker_assignments --> positions
positions --> geofence_evaluation
geofence_evaluation --> tracker_geofence_events
tracker_geofence_events --> tracker_latest