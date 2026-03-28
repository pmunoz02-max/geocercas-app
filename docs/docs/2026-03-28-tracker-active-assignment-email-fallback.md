# Tracker active assignment email fallback

## Change
The tracker active assignment endpoint now falls back to resolving `personal` by email when `personal.user_id` is not linked.

## Reason
Some tracker users exist and authenticate correctly, but the related `personal.user_id` is null. In those cases, active assignments must still be resolved using the tracker email.

## Rule
Resolution order:
1. personal.user_id = tracker user id
2. personal.email = tracker email

Then:
- find active assignment in `asignaciones`
- use `start_time` and `end_time` as the assignment window

## Impact
Prevents false `no_personal_found` responses when the tracker is correctly associated by email.