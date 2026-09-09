-- DRAFT, NOT RUN. Dedicated committed fixture: cap=1, zero active trackers.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='30s';
INSERT INTO public.memberships(org_id,user_id,role,revoked_at)
VALUES (:'org_id'::uuid, :'user_a'::uuid, 'tracker', NULL);
\echo A holds the org lock. Start session-b.sql in connection B now.
\prompt 'Once B is waiting, press Enter to commit A: ' continue_a
COMMIT;
