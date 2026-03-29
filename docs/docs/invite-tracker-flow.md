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