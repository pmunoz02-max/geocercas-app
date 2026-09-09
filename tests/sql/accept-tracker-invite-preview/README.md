# Acceptance RPC tests — drafts, not executed

Requires the acceptance migration and the already-applied quota migration. Use isolated Preview fixtures only. transactional.sql creates synthetic Auth users, organizations and invitations inside a transaction and finishes with ROLLBACK. It also creates temporary test helpers and a fixture-specific failure trigger that must never remain installed. On failure, explicitly ROLLBACK the session. No emails/passwords/JWT are produced.

Coverage: raw token and org matching, expected identity mismatch, zero override, inactive plan, forced failure of invite UPDATE after membership writes (rollback including bridges), first/repeated acceptance, already-active tracker at capacity, revoked retry, new invitation reactivation, expired/inactive invites, owner protection, another-org owner preserved, unresolved recipient, admin conversion, FREE 2/PRO 10/Enterprise 50, missing billing, RPC grants.

For concurrency: separately authorized dedicated committed fixtures with cap=1, zero trackers, two Auth recipients and two unexpired active tracker invites with different tokens. Supply org_id, user_a, token_a in A and org_id,user_b,token_b in B. Run A, pause, start B in a distinct connection, verify pg_stat_activity shows B blocked by A, then commit A. B must reject and leave its invitation unaccepted. Dispose of these fixtures after the test. Do not assume calls through a connector overlap merely because they were dispatched in parallel.

Also repeat with the SAME token/recipient: replace B's expected-rejection block with a call asserting already_accepted=true and the same accepted_at returned by A; count must stay 1. Repeat with A rolling back: B should then accept. These variants and deadlock retry behavior require real connections; no validation is claimed until executed.

Before applying, verify the existing schema/functions have not drifted. In particular email_norm, used_by_user_id and role were verified from the user's Preview metadata; this step executes no database inspection query. Identity resolution requires an existing Auth user. It does not provision users or assign passwords.
