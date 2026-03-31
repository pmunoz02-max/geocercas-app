# Invite Flow Update — Null personal_id guard

## Change
All invite flow logic now resolves `personal_id` safely without assuming assignment exists.

## Rule
- Never read `assignment.personal_id` directly
- Always resolve:
  - assignment?.personal_id
  - payload.personal_id
  - request body personal_id

## Impact
Prevents runtime crash:
"Cannot read properties of null (reading 'personal_id')"