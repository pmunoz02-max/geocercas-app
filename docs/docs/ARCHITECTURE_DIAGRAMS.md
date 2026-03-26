ROADMAP_ARCHITECTURE_EVOLUTION.md
1. Purpose

This document defines the architectural evolution roadmap for App Geocercas.

The system currently contains a mix of:

canonical models

legacy compatibility structures

transitional schemas

The purpose of this roadmap is to guide the safe and gradual evolution of the platform architecture while maintaining operational stability.

This document defines:

canonical system targets

legacy deprecation strategy

tracking engine improvements

geofence model consolidation

SaaS scalability improvements

This roadmap is architectural guidance, not a migration script.

2. Current Architecture Status

The current system architecture includes:

Canonical components

organizations

memberships

profiles

personal

org_people

geofences

asignaciones

tracker_assignments

positions

tracker_geofence_events

tracker_latest

Legacy or transitional components

geocercas

tracker_positions

membership variants (org_users, user_organizations)

invitation variants

attendance variants (attendances, asistencias)

These legacy elements exist to maintain compatibility with historical code and data.

3. Long-Term Architecture Vision

The long-term architecture should converge to a clean canonical model.

Canonical domains

Identity and organizations:

organizations
memberships
profiles

Operational identity:

personal
org_people

Territorial model:

geofences

Assignments:

asignaciones
activities

Tracking pipeline:

tracker_assignments
positions
tracker_geofence_events
tracker_latest

Legacy structures should gradually disappear from the operational path.

4. Phase 1 — Stabilization

Objective:

Ensure the current system operates with a single canonical pipeline.

Key tasks:

formalize the tracking pipeline

document geofence evaluation model

stabilize event generation

enforce organization isolation

define SaaS limits

Outputs already implemented:

TRACKING_SCALABILITY_DECISION.md

GEOFENCE_ENGINE_ARCHITECTURE.md

GEOFENCE_EVENT_RULES.md

SaaS_LIMITS_AND_ENTITLEMENTS.md

Result:

A stable and scalable baseline architecture.

5. Phase 2 — Canonical Geofence Consolidation

Objective:

Fully migrate the platform toward the geofences model.

Current situation:

geocercas  → legacy model
geofences  → canonical model

Tasks:

ensure all new features use geofences

convert UI layers to read from geofences

maintain compatibility views where necessary

migrate spatial logic to PostGIS geometry

Result:

A single geofence model used by the entire platform.

6. Phase 3 — Tracking Engine Hardening

Objective:

Improve the reliability and performance of the tracking engine.

Key improvements:

refine geofence evaluation logic

improve event deduplication

implement jitter handling rules

optimize candidate geofence filtering

improve event idempotency

Expected outcome:

A robust geofence engine capable of handling large tracking volumes.

7. Phase 4 — Data Lifecycle Optimization

Objective:

Improve long-term scalability of tracking data.

Tasks include:

implement retention policies

archive historical positions

optimize time-series queries

support long-term event analytics

Relevant tables:

positions
tracker_geofence_events

This phase ensures sustainable storage growth.

8. Phase 5 — SaaS Monetization Expansion

Objective:

Expand the SaaS capabilities of the platform.

Key improvements:

enforce plan-based limits

introduce usage monitoring

support feature entitlements

enable enterprise customization

Core table:

org_billing

This phase aligns architecture with business growth.

9. Phase 6 — Observability and Reliability

Objective:

Improve operational visibility and system resilience.

Tasks:

expand monitoring dashboards

detect pipeline failures

track geofence evaluation performance

monitor tracker health

Relevant document:

SYSTEM_OBSERVABILITY_AND_MONITORING.md

This phase improves system maintainability.

10. Phase 7 — Legacy Decommissioning

Objective:

Gradually remove legacy structures once migration is complete.

Legacy targets include:

geocercas
tracker_positions
membership variants
attendance variants

Decommissioning must follow:

migration validation

data compatibility checks

staged rollout

safe fallback procedures

11. Migration Safety Strategy

All architectural changes must follow a controlled process.

Key rules:

implement changes in preview branch

validate behavior in preview deployments

ensure backward compatibility

promote to production only after verification

This ensures stability of the live system.

12. Architectural Governance

Future architectural changes should follow these principles:

canonical models over legacy structures

explicit documentation before schema changes

clear migration strategies

backward compatibility during transitions

Architecture decisions should always reference:

DB_SCHEMA_MAP.md
13. Future Architecture Opportunities

Possible long-term improvements include:

event-driven tracking pipelines

advanced geospatial analytics

AI-based movement pattern analysis

automated anomaly detection

route optimization algorithms

These features build on the existing tracking foundation.

14. Expected Outcome

Following this roadmap will lead to:

simplified database schema

improved system scalability

clearer operational flows

stronger SaaS monetization capabilities

easier long-term maintenance

This roadmap ensures that App Geocercas evolves into a robust geospatial SaaS platform.