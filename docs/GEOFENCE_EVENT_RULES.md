GEOFENCE_EVENT_RULES.md
1. Purpose

This document defines the event generation rules used by the geofence engine in App Geocercas.

It specifies:

when events must be generated

when events must be ignored

how GPS jitter is handled

how duplicate events are prevented

how missing positions affect event detection

The objective is to ensure that geofence events are stable, deterministic, and reliable.

This document complements:

docs/GEOFENCE_ENGINE_ARCHITECTURE.md

docs/GEOFENCE_EVALUATION_MODEL.md

docs/TRACKING_EVENT_MODEL.md

No SQL or runtime implementation is defined here.

2. Event Types

The system supports two primary geofence events.

Event	Meaning
ENTER	tracker enters a geofence
EXIT	tracker exits a geofence

Events represent state transitions, not raw GPS observations.

3. Geofence State Model

Each tracker has a state relative to each geofence.

Possible states:

State	Description
OUTSIDE	tracker not inside geofence
INSIDE	tracker inside geofence

Events occur only when the state changes.

4. State Transition Rules

State transitions produce events.

Previous	Current	Event
OUTSIDE	INSIDE	ENTER
INSIDE	OUTSIDE	EXIT
INSIDE	INSIDE	no event
OUTSIDE	OUTSIDE	no event

This rule ensures events represent meaningful movement.

5. Duplicate Event Prevention

GPS signals may oscillate near geofence boundaries.

Without protection, the system could generate:

ENTER
EXIT
ENTER
EXIT

within seconds.

To prevent this, event generation must consider:

previous state

minimum movement

time since last event

Events must only be generated when a true state change is detected.

6. Minimum Distance Threshold

Small GPS inaccuracies must not trigger events.

Example scenario:

tracker standing near boundary

GPS jitter moves point slightly in/out

Mitigation rule:

State transitions should only be accepted if the position crosses the boundary by a minimum distance threshold.

Typical threshold:

5–20 meters

The exact value may depend on device accuracy.

7. Minimum Time Threshold

Events must not occur too frequently.

Example:

ENTER
EXIT
ENTER

within seconds.

Rule:

Events must respect a minimum time interval between transitions.

Typical threshold:

30–120 seconds
8. Consecutive Position Confirmation

State transitions should be confirmed by multiple positions when possible.

Example rule:

require 2 consecutive INSIDE positions before ENTER

require 2 consecutive OUTSIDE positions before EXIT

This reduces noise caused by GPS drift.

9. Missing Position Handling

Devices may temporarily stop sending data.

Possible causes:

connectivity loss

battery saving

device shutdown

Rules:

missing positions must not immediately trigger EXIT

state remains unchanged until a new position confirms change

10. Delayed EXIT Detection

If a tracker leaves a geofence but the next position is delayed, EXIT may occur later than the actual exit.

This is acceptable behavior because:

the system relies on received positions

GPS tracking is discrete, not continuous

Event timestamps represent detection time, not exact crossing time.

11. Overlapping Geofences

A tracker may belong to multiple geofences simultaneously.

Possible scenarios:

nested zones

overlapping operational areas

shared boundaries

Rules:

each geofence state is tracked independently

events may occur for multiple geofences at the same timestamp

Example:

ENTER zone_A
ENTER zone_B
12. Geofence Priority (Optional)

In future versions, geofences may have priority levels.

Example use cases:

site zones vs subzones

building vs room

operational hierarchy

Priority rules are not required in the current architecture.

13. Boundary Edge Behavior

Positions exactly on geofence boundaries are ambiguous.

Recommended rule:

Boundary positions should be treated consistently as either:

INSIDE, or

OUTSIDE

but never fluctuate between both states.

Consistency is more important than geometric precision.

14. Event Idempotency

Event generation must be idempotent.

Meaning:

Processing the same position twice must not create duplicate events.

Strategies include:

previous state checks

unique constraints

event deduplication logic

15. Event Ordering

Events must follow chronological order for each tracker/geofence pair.

Example valid sequence:

ENTER
EXIT
ENTER
EXIT

Invalid sequences:

ENTER
ENTER
EXIT

or

EXIT
EXIT

The system must prevent inconsistent event histories.

16. Event Data Requirements

Each event record must contain enough context for analysis.

Typical fields include:

organization

tracker identity

geofence identifier

event type

timestamp

location of detection

source of position

This enables:

operational monitoring

compliance reports

audit trails

17. Event Recovery

Because positions history is preserved, the system can reconstruct events if needed.

Possible recovery scenarios:

system downtime

event generation failure

algorithm improvements

Reprocessing historical positions should produce the same events.

18. Testing Scenarios

The engine should be validated against the following scenarios:

entry into single geofence

exit from single geofence

jitter near boundary

overlapping geofences

missing positions

delayed GPS updates

rapid movement through zone

These scenarios ensure reliable event generation.