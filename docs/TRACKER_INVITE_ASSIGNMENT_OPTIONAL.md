# Tracker Invite Assignment Requirement Change

As of March 2026, inviting a tracker no longer requires an `assignment_id`. The assignment is now optional:

- If `assignment_id` is provided, assignment details will be included in the invite.
- If `assignment_id` is not provided or is null, the invite will still be sent, and assignment details will be omitted.
- All backend and frontend validations requiring `assignment_id` have been removed.

This change allows inviting trackers without an active assignment.

---

**Relevant files updated:**
- Frontend: `src/pages/InvitarTracker.jsx`
- API: `api/invite-tracker.js`
- Supabase function: `supabase/functions/send-tracker-invite-brevo/index.ts`

---

For further details, see commit history or contact the development team.
