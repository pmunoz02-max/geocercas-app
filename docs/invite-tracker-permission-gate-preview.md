# Invite Tracker permission gate preview

Date: 2026-09-08

## Scope

This change updates the preview invite-tracker screen to use the entitlement hook as the single source of truth for whether the organization can invite trackers.

## What changed

- `canInviteTrackers` from `useOrgEntitlements` is still the gate for:
  - loading active personal rows
  - enabling the form
  - validating submit before sending the invite
- stale async responses are now guarded with a per-request token so older org responses cannot overwrite newer org state
- the hook only accepts entitlements when `entitlements.org_id` matches the active `currentOrgId`; otherwise `canInviteTrackers` resolves to `false`
- local `isActive`-based plan blocking remains removed from the main invite workflow
- `trackerLimitReached` remains a separate quota control, independent from permission checks
- permission loading and count loading are both treated as blockers for sending
- count-loading errors are surfaced as explicit quota errors instead of being converted to `0`
- blocked-state messaging is now neutral and specific:
  - permission loading
  - plan information load failure
  - permission disabled
  - quota check failure
  - tracker quota reached

## i18n keys

The invite flow uses separate keys for the user-facing states instead of reusing generic technical copy:

- `inviteTracker.plan.permissionDisabledTitle`
- `inviteTracker.plan.permissionDisabledBody`
- `inviteTracker.errors.planLoadFailed`
- `inviteTracker.errors.trackerCountFailed`

These strings are intentionally neutral and do not recommend upgrading the plan when the organization data is still loading or unavailable.

## Source semantics

The hook only admits sources backed by a real row or a real billing fallback:

- `org_entitlements`
- `org_entitlements+org_billing`
- `billing_fallback`

The following are intentionally excluded:

- `tracker_route_bypass`
- `default_free_fallback`
- `error_free_fallback`

This keeps the UI from treating temporary failures or synthetic fallbacks as valid permission to invite trackers.

## Stale response protection

The entitlement loader now uses a request-scoped invalidation token (`useRef`) to reject stale async updates. Every new load invalidates prior requests before any state mutation. This covers:

- delayed org A responses arriving after org B is active
- stale auth changes during a pending fetch
- unmount and session-loss races
- async failures from older requests still writing into state after a newer request has already taken over

The guard is checked before each state update, including the error branch, so previous-org data cannot win once the active org changes.

## Frontend validation status

This is a frontend validation record only. It confirms the behavior of the React hook and the invite screen under preview/test conditions; it is not a deploy or production-data verification.

Verified with Vitest in preview mode:

- `src/hooks/useOrgEntitlements.test.jsx`: 4/4 tests passing
- `src/pages/InvitarTracker.test.jsx`: 10/10 tests passing
- combined result: 14/14 tests passing

The approved scenarios cover:

- free / pro / enterprise limits
- override `0` and override `1`
- inactive-plan rejection
- synthetic fallback rejection
- stale previous-org response rejection after an auth/org switch
- invite screen gating, blocked state rendering, and quota errors

## UI behavior

- The screen will stay in a synchronized/loading state while permissions are loading
- it will display a clear error if the entitlement load fails
- it will reject plan-disabled states with the plan-aware message
- it will keep the tracker quota as a separate warning/error state
- it will not force a limit reached state from a count error
- it will keep the invitation gate closed when the returned entitlement row does not belong to the active organization
