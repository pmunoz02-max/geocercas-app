# Tracker Invite – Send Order Hardening

## Problem
A tracker invite email could still be sent with a Supabase magic link even when the proxy rejected the upstream response.

## Cause
The email send step happened before strict validation of the final invite URL.

## Fix
The edge function must:
1. build the direct `/tracker-accept?...&access_token=...` URL
2. validate it
3. only then send the Brevo email

If the URL contains `auth/callback`, `token_hash`, `magiclink`, or lacks `access_token`, the function must fail before sending.