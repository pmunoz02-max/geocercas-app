# Tracker Invite – Remove Magic Link Flow

## Context
Android tracker requires a valid session at app launch.

## Problem
Supabase magic links (token_hash, auth/callback) do not provide a usable access_token for Android deep links.

Result:
- no session in WebView
- tracker inactive
- no position tracking

## Solution
Tracker invite flow no longer uses magic links.

Now generates:

/tracker-accept?org_id=XXX&lang=XX&access_token=YYY

Where access_token is caller_jwt from the authenticated user.

## Result
- Android receives access_token directly
- WebView injects session
- tracker-gps loads with session
- assignment resolves
- tracking starts

## Important
Magic link flow is NOT used for tracker onboarding anymore.

## Next
Future improvement: replace access_token in URL with invite_token + backend exchange.