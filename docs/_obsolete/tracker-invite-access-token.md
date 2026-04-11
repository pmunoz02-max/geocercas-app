# Tracker Invite – Access Token Injection (Android Bootstrap)

## Context
Android tracker app requires a valid session at startup to activate tracking.

## Problem
Deep links were generated without access_token, causing:
- no session in WebView
- tracker inactive
- no position sending

## Solution
Invite link now includes:

/tracker-gps?org_id=XXX&access_token=YYY

## Result
- Android receives token via deep link
- WebViewActivity stores session
- TrackerGpsPage detects session
- Tracking starts automatically

## Next Step
Migrate to invite_token + backend exchange for improved security.