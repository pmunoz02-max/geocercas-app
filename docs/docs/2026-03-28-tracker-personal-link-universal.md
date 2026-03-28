# Universal tracker-personal link

## Change
Tracker invite flow now guarantees the link between tracker user and personal record.

## Rule
A tracker must always resolve to exactly one `personal` record in the same organization.

## Implementation
- On tracker invite/creation, the system links:
  - `personal.user_id = tracker_user_id`
- This update is allowed only when:
  - `personal.id = personal_id`
  - `personal.org_id = org_id`
  - `personal.is_deleted = false`
- If `personal.user_id` already exists and is different, the system must fail with a conflict error.

## Active assignment resolution
The tracker active assignment endpoint resolves in this order:
1. `personal.user_id = tracker_user_id`
2. active assignment in `asignaciones` by `personal_id` and `org_id`

Email fallback may remain temporarily only for migration/backfill, but it is not the final source of truth.

## Impact
- Prevents false `no_personal_found`
- Makes tracker assignment resolution deterministic
- Enforces the rule:
  - tracker without active assignment does not operate