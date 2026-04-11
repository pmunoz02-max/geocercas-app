# Tracker Invite Proxy Hardening

## Purpose
Prevent tracker onboarding from accepting Supabase magic links.

## Change
`api/invite-tracker.js` now validates upstream invite URLs strictly.

## Rejected patterns
- `/auth/callback`
- `token_hash`
- `magiclink`
- `type=magiclink`

## Required pattern
Direct tracker invite URL:

`/tracker-accept?org_id=...&access_token=...`

## Result
If upstream returns an invalid invite URL, the proxy fails explicitly instead of forwarding a broken link to Android.