# Tracker Onboarding Flow (Updated)

## Context

Previously, tracker assignment required that a `personal` record already existed for the authenticated user.

This caused failures when trackers logged in with new users that were invited but not yet linked to the organization.

## New Behavior

The system now supports dynamic onboarding via invitation.

Flow:

1. User logs in (any email)
2. System checks for pending invitation
3. If invitation exists:
   - Create or link `personal` record
   - Attach `user_id` to `personal`
   - Associate with `org_id`
4. Then resolve active assignment

## Key Rule

Tracker onboarding is now invitation-driven, not pre-created user-driven.

## Impact

- Eliminates dependency on manual personal creation
- Allows tracker login with any invited account
- Ensures consistent assignment resolution