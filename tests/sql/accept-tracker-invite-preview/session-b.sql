-- NOT RUN. Start while A is paused; cap=1 and two different recipients.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL application_name='acceptance_test_B';
SET LOCAL lock_timeout='60s';
SELECT set_config('test.org',:'org_id',true),set_config('test.token',:'token_b',true),set_config('test.user',:'user_b',true);
DO $t$ BEGIN
BEGIN
PERFORM public.accept_tracker_invite_transactional(current_setting('test.org')::uuid,current_setting('test.token'),current_setting('test.user')::uuid);
RAISE EXCEPTION 'Two acceptances consumed the last slot' USING ERRCODE='ZX001';
EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'tracker_limit_reached' THEN RAISE; END IF; END;
IF (SELECT count(*) FROM public.memberships WHERE org_id=current_setting('test.org')::uuid AND role::text='tracker' AND revoked_at IS NULL)<>1
 OR EXISTS(SELECT 1 FROM public.tracker_invites WHERE org_id=current_setting('test.org')::uuid
 AND invite_token_hash=encode(sha256(convert_to(current_setting('test.token'),'UTF8')),'hex') AND accepted_at IS NOT NULL) THEN
RAISE EXCEPTION 'Wrong committed state'; END IF;
END;$t$;
SELECT 'loser_rejected' AS result;
ROLLBACK;
