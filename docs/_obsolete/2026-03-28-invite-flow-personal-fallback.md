# Invite Flow Update — Personal Fallback Without Assignment

## Change
Tracker invite flow now safely handles cases where no assignment is provided by using `personal_id` from the request payload.

## Previous Behavior
- System attempted to read `assignment.personal_id`
- Failed when assignment was null
- Produced error:
  "Cannot read properties of null (reading 'personal_id')"

## New Behavior
- Assignment is optional
- If assignment exists:
  - Use `assignment.personal_id`
- If assignment is null:
  - Use `personal_id` from request payload
- No null access errors

## Backend Changes
- Guarded all assignment access using optional chaining
- Added fallback logic:
  - assignment?.personal_id ?? payload.personal_id

## Impact
- Prevents runtime crashes
- Fully decouples invite flow from assignments
- Stabilizes onboarding process

## Rule Alignment
Aligned with system rules:
> un tracker puede existir sin asignación
> una asignación puede existir sin tracker