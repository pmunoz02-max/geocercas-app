# Tracker active assignment source of truth

## Change
The tracker active assignment endpoint now resolves assignment activity from `asignaciones`, using `tracker_assignments` only as the relationship table.

## Rule
- `tracker_assignments` identifies which assignment belongs to the tracker
- `asignaciones` is the source of truth for active/inactive status
- Tracker relation must not be rejected only because `tracker_assignments` flags or dates are missing/inconsistent

## Impact
Prevents false "No active assignment" states when the tracker is correctly linked to an active assignment.