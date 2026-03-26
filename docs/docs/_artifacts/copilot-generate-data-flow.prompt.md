You are documenting the internal data flow of the project **App Geocercas**.

Your task is to create or fully replace:

docs/DATA_FLOW.md

This is a **documentation-only** task.

Do NOT:

- generate SQL
- modify migrations
- modify frontend code
- modify backend code
- modify Supabase settings
- invent runtime behavior that is not documented

Only create technical documentation.

---

## SOURCE OF TRUTH

The main source of truth is:

docs/DB_SCHEMA_MAP.md

You may also use, only as supporting context if they exist:

docs/DB_OVERVIEW.md
docs/TRACKER_SYSTEM.md
docs/FLUJOS_CLAVE.md
docs/TABLE_RELATION_DIAGRAM.md

But if anything conflicts, **DB_SCHEMA_MAP.md wins**.

Do NOT invent:

- new tables
- new RPC functions
- new services
- new queues
- new background jobs
- new API layers
- undocumented relationships

If some behavior is not explicitly documented, label it clearly as:

- inferred flow
- likely flow
- undocumented detail

Never present assumptions as confirmed facts.

---

## PROJECT CONTEXT

App Geocercas is a territorial control SaaS platform with:

- geofences / geocercas
- GPS tracking
- personnel management
- territorial assignments
- entry / exit events
- map visualization
- multi-organization support

Technology stack:

Frontend:
- React
- Vite
- Leaflet
- Tailwind

Backend:
- Supabase
- PostgreSQL
- RLS
- SQL / RPC

Infrastructure:
- Vercel

Mobile:
- Android (Google Play)

---

## DOCUMENT GOAL

Create a clear technical document describing how data moves through the system.

The document must help:

- developers
- reviewers
- future maintainers
- AI assistants such as Copilot / GPT

understand the operational pipelines of the platform.

The document should focus on **how data flows across documented tables and domains**, not just listing tables.

---

## REQUIRED DOCUMENT STRUCTURE

Create the file with the following sections.

# DATA FLOW

## 1. Purpose

Explain that this document describes the main data movement pipelines of App Geocercas, based on the documented schema.

Clarify that the document distinguishes between:

- confirmed documented flow
- inferred logical flow
- legacy / transitional flow

---

## 2. Source of Truth and Scope

State clearly that:

- docs/DB_SCHEMA_MAP.md is the source of truth
- this file documents data flow using only documented schema objects
- undocumented runtime details must not be treated as confirmed

---

## 3. Core Domains Participating in Data Flow

Summarize the domains involved in movement of data:

- Organizations and memberships
- Profiles / users
- Personal / org_people
- Geofences / geocercas
- Asignaciones
- Activities / activity_assignments
- Tracking: positions, tracker_assignments, tracker_geofence_events, tracker_logs, tracker_latest
- Attendance domain if documented
- Billing only if it participates in data flow relevant to operations

Do not over-explain tables that are outside operational flow.

---

## 4. High-Level System Flow

Write a high-level narrative explaining how the platform likely works end to end.

Expected shape:

organization context
→ user / membership context
→ operational entity (personal)
→ territorial configuration (geofence / assignment / activity)
→ tracking ingestion
→ position storage
→ geofence evaluation
→ event generation
→ latest status / operational visibility

This must be written carefully:
- confirmed where documented
- inferred where not explicitly documented

---

## 5. Main Operational Pipelines

This is the most important section.

Document the main pipelines separately.

### 5.1 Organization and access flow

Describe flow using documented objects such as:

organizations
memberships
profiles

Goal:
show how data is scoped per organization and how operational context begins.

Clarify:
org_id often represents logical scope and multi-tenant boundary, not necessarily a confirmed FK.

---

### 5.2 Personnel onboarding / operational identity flow

Describe how a person becomes an operational subject in the system using documented tables such as:

profiles
personal
org_people

Explain the difference between:
- platform identity
- organization membership
- operational person/entity

If exact runtime linkage is not documented, say so.

---

### 5.3 Geofence configuration flow

Describe the flow for territorial configuration:

organizations
geofences
geocercas
asignaciones
activities
activity_assignments

Explain clearly:
- geofences is the modern model
- geocercas is legacy / historical coexistence
- asignaciones appears to connect person + territory + activity + time

Do not claim formal FK unless documented.

---

### 5.4 Tracker assignment and tracking ingestion flow

Describe the flow involving:

tracker_assignments
positions
tracker_logs
tracker_latest
tracker_positions (legacy if applicable)

Explain the most likely operational sequence:

tracker is assigned
→ tracking records arrive
→ positions are stored
→ logs / latest state may be updated
→ legacy compatibility may coexist

Important:
If ingestion mechanism is not documented, do not invent API endpoints or background jobs.
Keep it at data-model flow level.

---

### 5.5 Geofence event generation flow

Describe the flow involving:

positions
geofences / geocercas
tracker_geofence_events

Explain the likely sequence:

new position
→ evaluated against active geofence context
→ event generated for entry / exit / presence logic
→ stored in tracker_geofence_events

Clearly distinguish:
- documented schema facts
- inferred runtime behavior

Mention the documented confirmed FK:

tracker_geofence_events.geocerca_id -> geofences.id

Also note any naming inconsistency if present, but do not try to resolve it in this doc.

---

### 5.6 Current state / operational visibility flow

Describe how the system likely exposes latest operational status using:

tracker_latest
positions
tracker_geofence_events

Explain that tracker_latest likely represents a denormalized or convenience view/table for recent state if that is documented or inferable.

If not fully documented, label as inferred.

---

### 5.7 Attendance flow (only if documented enough)

If attendances / asistencias / attendance_events appear in DB_SCHEMA_MAP.md with enough context, create a small subsection explaining their likely role.

If documentation is weak, explicitly mark this domain as transitional / underdocumented.

---

## 6. Canonical vs Legacy Flow

Create a section that clearly separates:

Canonical / current flow:
- geofences
- positions
- memberships
- org_id model

Legacy / compatibility flow:
- geocercas
- tracker_positions
- membership variants
- tenant_id remnants
- attendance variants if applicable

Explain that both may coexist in documentation, but legacy flow should not be treated as preferred architecture.

---

## 7. Multi-tenant Data Boundary

Add a section explaining how data is logically partitioned by organization.

Important notes:
- org_id is a recurring multi-tenant boundary
- not every org_id relationship is a formal FK
- RLS should be understood as access control context, not as a structural edge in the schema
- data flow should be interpreted inside organization scope

---

## 8. Data Flow Diagram(s)

Include Mermaid diagrams.

Required diagrams:

### Diagram A — High-level operational flow

A simple top-down flowchart showing something like:

organizations
→ memberships / profiles
→ personal / org_people
→ geofences / asignaciones / activities
→ tracker_assignments
→ positions
→ tracker_geofence_events
→ tracker_latest

Use neutral labels and avoid asserting undocumented mechanics.

### Diagram B — Tracking and geofence event flow

A more focused flowchart for:

tracker_assignments
→ positions
→ geofence evaluation
→ tracker_geofence_events
→ tracker_latest

Important:
If "geofence evaluation" is not a table, represent it as a logical process node, clearly labeled as logical/inferred.

### Diagram C — Legacy compatibility flow

Show legacy coexistence such as:

geocercas
tracker_positions
membership legacy variants

Label clearly as legacy / compatibility.

---

## 9. Confirmed vs Inferred Flow Notes

Create a section with two subsections:

### Confirmed from schema documentation
Only include things directly supported by DB_SCHEMA_MAP.md.

### Inferred from documented structure
Include reasonable architectural interpretations, but mark them explicitly as inferred.

This section is mandatory.

---

## 10. Risks, Gaps, and Transitional Areas

Document areas where the current architecture appears transitional, such as:

- geocercas vs geofences
- tracker_positions vs positions
- tenant_id vs org_id
- attendance table variants
- membership table variants

Explain how these transitions can affect debugging, reporting, migrations, and AI-assisted development.

---

## 11. Recommendations for Future Documentation

Add concise recommendations such as:

- document ingestion entry points
- document event generation rules
- document tracker_latest semantics
- document attendance canonical model
- document RLS policy map
- document RPC usage per domain

Do not generate implementation work, only documentation recommendations.

---

## STYLE RULES

Write in clear technical English.
Use concise, architecture-focused language.
Prefer structured sections and short explanatory paragraphs.
Use bullet lists only when they improve readability.
Do not add fluff.

---

## CRITICAL RULES

1. Do not invent system behavior.
2. Distinguish facts from inference.
3. Treat DB_SCHEMA_MAP.md as authoritative.
4. Keep legacy and canonical flows separated.
5. Do not touch any file except:

docs/DATA_FLOW.md

---

## OUTPUT

Create a complete, production-quality documentation file at:

docs/DATA_FLOW.md