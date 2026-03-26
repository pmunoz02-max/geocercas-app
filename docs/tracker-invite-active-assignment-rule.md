# Tracker Invite Rule — Active Assignment Required

## Context

To improve system integrity and prevent invalid tracker onboarding,
a new rule has been introduced in the tracker invitation flow.

## New Rule

A tracker can only be invited if it has at least one active assignment.

## Definition of Active Assignment

An assignment is considered active if:

- org_id matches the current organization
- active = true
- start_date <= current date
- end_date >= current date

## Enforcement

### Backend (Critical Enforcement)

Implemented in:

- api/invite-tracker.js

Before sending an invite, the system validates the existence of at least one active assignment in `tracker_assignments`.

If validation fails, the API returns:

- code: TRACKER_REQUIRES_ACTIVE_ASSIGNMENT
- message: Solo se puede invitar a trackers con asignaciones activas

### Frontend (UX Enforcement)

Implemented in:

- src/components/tracker/TrackerPage.jsx

Behavior:

- "Invitar" button is disabled when `has_active_assignment = false`
- Tooltip explains the restriction

### Data Source

The flag `has_active_assignment` is computed in:

- src/lib/trackersApi.js

Using:

- subquery over `tracker_assignments`

## Scope

- Preview environment only
- No production impact
