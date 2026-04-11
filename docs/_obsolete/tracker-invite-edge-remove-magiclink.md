# Tracker Invite Edge – Remove Magic Link

## Context
Tracker onboarding on Android cannot use Supabase magic links.

## Problem
The edge function `send-tracker-invite-brevo` was still returning magic-link style URLs:
- auth/callback
- token_hash
- magiclink

This broke Android tracker session bootstrap.

## Solution
Removed all magic link generation from the edge function.

Now it returns only direct tracker invite URLs:

/tracker-accept?org_id=...&lang=...&access_token=...

## Rule
If caller_jwt is missing, the function must fail explicitly and never fall back to magic link generation.