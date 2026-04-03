# Tracker auth flow update

Preview tracker invite flow now sends a direct callback URL using `token_hash` instead of relying on the old Supabase `verify?token=...` link.

Current flow:
1. Invite email points to `/auth/callback?token_hash=...&type=magiclink`
2. `AuthCallback` verifies the token hash
3. Tracker session must persist through `supabaseTrackerClient`
4. `detectSessionInUrl` must be `true` for tracker auth flows

Critical files:
- `supabase/functions/send-tracker-invite-brevo/index.ts`
- `src/lib/supabaseTrackerClient.js`

Environment:
- preview only
- domain: `preview.tugeocercas.com`