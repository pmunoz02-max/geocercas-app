TRACKING_SCALABILITY_DECISION.md
1. Purpose

This document defines the official scalability architecture decisions for the tracking subsystem of App Geocercas.

It establishes the canonical operational model for:

GPS position ingestion

geofence evaluation

event generation

live tracker state

data lifecycle and retention

SaaS scaling constraints

This document complements:

docs/DB_SCHEMA_MAP.md

docs/DATA_FLOW.md

docs/GEOFENCE_EVALUATION_MODEL.md

docs/TRACKING_EVENT_MODEL.md

No schema changes or migrations are defined here.
This is a decision and architecture reference document.

2. Canonical Tracking Pipeline

The official tracking pipeline for the system is defined as:

tracker_assignments
        ↓
positions
        ↓
geofence evaluation
        ↓
tracker_geofence_events
        ↓
tracker_latest
Pipeline purpose
Stage	Purpose
tracker_assignments	defines tracker operational context
positions	raw/enriched GPS ingestion
evaluation	geofence spatial intersection
tracker_geofence_events	persistent entry/exit events
tracker_latest	fast access to current tracker state

This pipeline is the only supported architecture for new tracking flows.

Legacy paths must not be extended.

3. Role of positions

positions is the canonical ingestion table for GPS location records.

It is designed as a high-write event table.

Typical characteristics:

high insert rate

append-only usage

time-series behavior

minimal updates

heavy historical growth

Key properties:

Property	Requirement
write optimized	yes
append-only	yes
frequently queried for history	yes
used for event generation	yes
Important rule

positions must not be used for live map queries.

Live state must be retrieved from:

tracker_latest
4. Role of tracker_latest

tracker_latest is a derived operational table.

Purpose:

Provide fast access to the current position and state of each tracker.

This table supports:

live map visualization

dashboards

current location queries

tracker status display

Design principles
property	value
small table	yes
1 row per tracker	yes
constantly updated	yes
optimized for reads	yes
Operational rule

The frontend must read from tracker_latest for:

live map

tracker list

operational dashboards

positions should only be used for:

historical queries

analytics

event generation

5. Role of tracker_geofence_events

tracker_geofence_events stores semantic movement events.

Examples:

ENTER geofence

EXIT geofence

These events represent business-relevant tracker behavior, not raw GPS data.

Typical event attributes:

organization

tracker identity

geofence

location

timestamp

event type

Benefits of the event model

Event persistence enables:

attendance detection

audit trails

operational alerts

reporting

activity analysis

Events must be generated only after spatial evaluation.

6. Geofence Model Decision

The system currently contains two territorial models:

geocercas
geofences
Decision

geofences is the canonical geofence model for all new tracking logic.

Characteristics:

PostGIS geometry

spatial indexes

modern schema

normalized attributes

geocercas remains as legacy compatibility model.

Migration rule

New features must use:

geofences

Legacy compatibility paths may continue reading from geocercas.

7. Geofence Evaluation Model

Evaluation logic operates conceptually as:

position received
        ↓
candidate geofences
        ↓
spatial intersection test
        ↓
previous state comparison
        ↓
event generation

Evaluation produces:

ENTER
EXIT

events stored in:

tracker_geofence_events

Evaluation rules are documented in:

docs/GEOFENCE_EVALUATION_MODEL.md
8. Data Volume Expectations

Tracking systems generate large volumes of location records.

Example estimation:

trackers	interval	positions/day
100	60 sec	144,000
500	60 sec	720,000
1000	30 sec	2,880,000

Historical storage growth must be expected.

This influences:

storage cost

query performance

index maintenance

9. Historical Data Strategy

positions should be treated as time-series historical data.

Recommended lifecycle:

age	strategy
0-30 days	hot operational data
30-180 days	analytical access
180+ days	archive strategy

Exact retention policies may depend on:

SaaS plan

compliance needs

customer configuration

10. SaaS Scaling Constraints

The system should support monetization through operational limits.

Possible limits:

metric	description
trackers	active tracked users/devices
geofences	number of active geofences
frequency	GPS update interval
history	retention period
events	alerts and automations

These constraints can be enforced through:

org_billing
11. Live System Performance Strategy

To maintain performance at scale:

live queries use tracker_latest

historical queries use positions

business events use tracker_geofence_events

geofence evaluation uses spatial indexing

Operational queries must avoid scanning:

positions

for live dashboards.

12. Legacy Compatibility Strategy

Legacy objects remain documented:

geocercas

tracker_positions

membership variants

attendance variants

These objects must not be used as targets for new features.

They remain for:

historical compatibility

migration support

legacy APIs

13. Migration Safety Rules

To protect system stability:

new tracking logic must use canonical tables

legacy tables must not receive new dependencies

migrations must maintain backward compatibility

preview branch testing is mandatory before promotion

14. Future Documentation Improvements

Future architecture documentation should include:

ingestion API architecture

event generation execution mechanism

spatial indexing strategy

tracker_latest refresh logic

data retention and archive implementation