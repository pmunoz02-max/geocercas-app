# Tracker operation requires active assignment

## Rule
A tracker without an active assignment must not operate.

## Effects
- Tracker GPS page may load, but must remain blocked
- No position sending without active assignment
- Unassigned trackers must not appear in operational dropdowns

## Reason
This keeps the tracking model consistent, auditable, and monetizable.