# Tracker to Personal Link

## Change
Tracker invite flow now ensures that the tracker user is linked to a personal record.

## Problem
The system could not resolve active assignments because `personal.user_id` was null.

This caused:
- "no_personal_found"
- false "No active assignment found" errors

## Solution
When inviting a tracker:
- The system now links:
  - tracker_user_id → personal.user_id

## Rule
A tracker must always be linked to a personal record to resolve assignments.

## Impact
- Active assignments are correctly detected
- Tracker GPS no longer shows false blocked state
- Assignment resolution becomes reliable