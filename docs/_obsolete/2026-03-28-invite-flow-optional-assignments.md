# Invite Flow Update — Optional Assignments

## Change
Tracker invite flow no longer requires assignment_id and no longer depends on assignments query.

## Previous Behavior
- Invite flow required assignment_id
- Assignments query was mandatory
- Invite failed if assignments query failed or returned empty
- Caused 422 and 500 errors

## New Behavior
- assignment_id is optional
- assignments query is optional
- Invite proceeds even if no assignments exist
- Invite does not fail if assignments query fails

## Backend Changes
- Removed assignment_id validation in:
  - api/invite-tracker.js
- Made assignments query non-blocking
- Updated Supabase function:
  - send-tracker-invite-brevo

## Impact
- Fixes onboarding blocker
- Removes hidden dependency on assignments
- Enables scalable tracker invite flow

## Rule Alignment
Aligned with system rule:
> una asignación puede existir sin tracker
> un tracker puede existir sin asignación