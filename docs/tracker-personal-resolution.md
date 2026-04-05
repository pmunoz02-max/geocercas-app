# Tracker Personal Resolution

## Change

Tracker active assignment resolution now requires mapping the authenticated user to a `personal` row within the current organization.

## Flow

auth.user.id
→ match personal.user_id within org_id
→ get personal.id
→ query asignaciones active using personal_id

## Reason

Ensures multi-tenant correctness and prevents cross-org mismatches.