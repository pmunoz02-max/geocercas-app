# Tracker Invite – Magic Link Removal

## Context
Android tracker requires a valid session immediately at app launch.

## Problem
Supabase magic links (auth/callback, token_hash) do not provide a usable access_token for Android deep links.

Result:
- no web session
- no assignment
- no tracking

## Solution
Removed all usage of Supabase magic links in tracker invite flow.

Now invites generate direct URLs:

/tracker-accept?org_id=XXX&lang=XX&access_token=YYY

Where access_token = caller_jwt

## Result
- Android receives valid session token
- WebView injects auth correctly
- tracker-gps loads with session
- assignment resolves
- tracking starts

## Important
Magic links are NOT used for tracker onboarding anymore.

## Next
Future improvement: replace access_token with invite_token + backend exchange.