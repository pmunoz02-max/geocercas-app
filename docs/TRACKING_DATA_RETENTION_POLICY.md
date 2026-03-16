TRACKING_DATA_RETENTION_POLICY.md
1. Purpose

This document defines the data lifecycle and retention policy for tracking data in App Geocercas.

Tracking systems generate very large volumes of location data.
Without a retention strategy, the system risks:

excessive storage growth

degraded query performance

increased infrastructure costs

slow analytical queries

This document establishes rules for:

GPS position retention

event retention

historical archival

SaaS plan-based limits

This policy complements:

docs/TRACKING_SCALABILITY_DECISION.md

docs/GEOFENCE_ENGINE_ARCHITECTURE.md

docs/GEOFENCE_EVENT_RULES.md

docs/DB_SCHEMA_MAP.md

2. Data Categories

Tracking data in the system can be grouped into three categories.

Data type	Table	Purpose
Raw tracking	positions	GPS history
Operational state	tracker_latest	live tracker state
Business events	tracker_geofence_events	entry/exit history

Each category has different retention requirements.

3. Raw Position Data (positions)

The positions table stores raw GPS observations.

Characteristics:

high insertion rate

append-only pattern

time-series data

very large growth potential

Retention strategy must prevent unlimited growth.

4. Recommended Retention Lifecycle

Tracking data should move through lifecycle stages.

Stage	Age	Description
Hot	0–30 days	operational queries
Warm	30–180 days	historical analysis
Archive	180+ days	long-term storage

Operational dashboards should primarily access hot data.

5. Hot Data

Hot data represents recent operational activity.

Typical uses:

live maps

recent tracker movement

recent attendance

operational dashboards

Primary tables:

positions
tracker_latest
tracker_geofence_events

Hot data must be optimized for:

fast writes

fast reads

recent queries

6. Warm Data

Warm data represents historical tracking records.

Typical uses:

reports

activity history

compliance checks

operational review

Warm data may remain in the same table but queried less frequently.

7. Archive Data

Archive data represents long-term historical records.

Possible strategies:

cold database storage

export to object storage

compressed archive tables

Archived data should not impact operational performance.

8. Event Retention (tracker_geofence_events)

Geofence events are semantically meaningful.

They represent:

entry/exit detection

operational activity

attendance signals

Events require longer retention than raw positions.

Recommended policy:

Data	Retention
Positions	shorter
Events	longer

This allows operational analytics even if raw GPS history is trimmed.

9. Live State (tracker_latest)

tracker_latest stores the current tracker position.

Characteristics:

one row per tracker

continuously updated

small table size

Retention policy:

No historical retention required

This table represents only the latest state.

10. SaaS Plan-Based Retention

Retention may vary by SaaS plan.

Example:

Plan	Position retention
Basic	30 days
Professional	90 days
Enterprise	365 days

Events may have longer retention:

Plan	Event retention
Basic	90 days
Professional	180 days
Enterprise	unlimited

Retention limits can be enforced through:

org_billing
11. Storage Growth Expectations

Example scenario:

Trackers	Interval	Positions/day
100	60 sec	144,000
500	60 sec	720,000
1000	30 sec	2,880,000

Without retention policies, historical data grows rapidly.

Retention management is required for sustainable operation.

12. Query Performance Strategy

Operational queries must avoid scanning large historical datasets.

Best practices:

live queries use tracker_latest

recent history queries filter by time

analytics queries run on restricted time windows

Indexes should prioritize recent data access patterns.

13. Data Deletion Strategy

Historical pruning must respect:

SaaS plan limits

legal compliance

customer data ownership

Deletion strategies may include:

scheduled cleanup jobs

archive-before-delete workflows

partition pruning

14. Compliance Considerations

Tracking data may fall under privacy regulations.

Important considerations:

user data ownership

right to deletion

secure archival

audit traceability

Retention policies must balance:

operational needs

legal obligations

storage cost.

15. Migration and Safety

Changes to retention policies must follow safe migration practices:

preview environment testing

gradual policy enforcement

archive before deletion

customer communication when needed

Production data must never be deleted without controlled procedures.

16. Future Improvements

Future enhancements may include:

automatic archival pipelines

partitioned position storage

analytical data warehouses

configurable retention per organization

These improvements allow the platform to scale to large tracking deployments.