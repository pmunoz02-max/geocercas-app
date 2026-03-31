# Invite Tracker Flow (Preview)

This document describes the current invite-tracker flow for preview environments.

## Flow Overview

1. **Frontend** calls `/api/invite-tracker` with the required parameters (org_id, email, name, assignment_id, personal_id).
2. **Backend** (`/api/invite-tracker`):
   - Validates that the organization, personal record, and assignment exist and are valid.
   - Assignment is **required** for tracker invites; requests without assignment_id are rejected.
   - If all validations pass, the backend calls the Supabase Edge Function `send-tracker-invite-brevo` to create or reuse the invite and send the magic link email.
3. **send-tracker-invite-brevo** handles the invite creation, magic link generation, and email delivery.

## Key Points
- The invite flow is only available in preview environments and may change in production.
- Assignment is now **required** for all tracker invites. The backend will return an error if assignment_id is missing.
- All validation and invite logic is handled server-side; the frontend only needs to call `/api/invite-tracker` with the correct parameters.
- Documentation and flow are up to date for preview/testing only.

## Canonical User Logic (2026-03)

- The `personal` record is the canonical source for tracker-user linkage.
- If `personal.user_id` exists, it is always reused as the canonical user for the invite. No new auth user is created, and the invite is not blocked.
- If `personal.user_id` does not exist, the backend will look up or create an auth user by email and proceed with the invite.
- The invite is never blocked just because `personal.user_id` exists; the same user can be invited again if needed.
- When the invite is accepted, the tracker role is applied to the user in the target org, even if the user already exists in other orgs.
- Cross-org membership is supported: accepting the invite grants tracker role in the inviting org, regardless of roles in other orgs.
- The only cases where the invite is blocked are:
  - No matching `personal` record exists for the org/email.
  - The email in `personal` does not match the invite email.
  - There is a true data inconsistency (e.g., conflicting user IDs).

## ID Mapping and Integrity Rules (2026-03)

- `personal.id`: Internal operational record for the person. Never used as a user reference in assignments.
- `personal.user_id`: Always the canonical link to the auth user (`auth.users.id`).
- `tracker_assignments.tracker_user_id`: Always set to the auth user's id (`auth.users.id`). Never use `personal.id` here.
- The backend ensures that all assignment and invite flows use the correct mapping and never confuse operational and auth/user IDs.
- This mapping is enforced in all inserts and updates, and is now covered by automated tests and code review policy.

---