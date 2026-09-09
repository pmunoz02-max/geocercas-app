-- NOT RUN. Requires dedicated committed fixtures; see README.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL application_name='acceptance_test_A';
SET LOCAL lock_timeout='30s';
SELECT public.accept_tracker_invite_transactional(:'org_id'::uuid,:'token_a',:'user_a'::uuid);
\prompt 'Start B and verify it waits, then press Enter to commit A: ' continue_a
COMMIT;
