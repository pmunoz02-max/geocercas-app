-- NOT RUN. Execute only in isolated Preview after separately approving migration.
-- Admin test connection; all fixtures, temporary helpers and test trigger roll back.
BEGIN ISOLATION LEVEL READ COMMITTED;
CREATE FUNCTION pg_temp.make_invite(o uuid,e text,t text) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE i uuid; BEGIN
UPDATE public.tracker_invites SET is_active=false WHERE org_id=o AND email_norm=lower(btrim(e)) AND is_active;
INSERT INTO public.tracker_invites(org_id,email,email_norm,role,is_active,expires_at,invite_token_hash)
VALUES(o,e,lower(btrim(e)),'tracker',true,clock_timestamp()+interval '1 hour',encode(sha256(convert_to(t,'UTF8')),'hex'))
RETURNING id INTO i; RETURN i; END;$f$;
CREATE FUNCTION pg_temp.expect_rejection(o uuid,t text,err text,u uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $f$ BEGIN
BEGIN
PERFORM public.accept_tracker_invite_transactional(o,t,u);
RAISE EXCEPTION 'Expected rejection: %',err USING ERRCODE='ZX001';
EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>err THEN RAISE; END IF; END;
END;$f$;
CREATE FUNCTION pg_temp.fail_accept_write() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
IF NEW.id::text=current_setting('test.fail_invite',true) THEN
RAISE EXCEPTION 'injected_accept_write_failure' USING ERRCODE='P0001'; END IF;
RETURN NEW; END;$f$;
CREATE TRIGGER test_only_fail_accept_write BEFORE UPDATE ON public.tracker_invites
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_accept_write();

DO $test$
DECLARE own uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
o uuid; other_org uuid; i uuid; j uuid; r jsonb; first_time text; token text; email_a text;
u uuid; n integer; lim integer; plan text;
BEGIN
email_a:='accept-a-'||a||'@example.invalid';
INSERT INTO auth.users(id,email) VALUES(own,'accept-owner-'||own||'@example.invalid'),
(a,email_a),(b,'accept-b-'||b||'@example.invalid');
INSERT INTO public.organizations(name,owner_id) VALUES('CODEX acceptance rollback test',own) RETURNING id INTO o;
INSERT INTO public.organizations(name,owner_id) VALUES('CODEX other owner rollback test',a) RETURNING id INTO other_org;
INSERT INTO public.memberships(org_id,user_id,role) VALUES(other_org,a,'owner');
UPDATE public.org_billing SET tracker_limit_override=1 WHERE org_id=o;
i:=pg_temp.make_invite(o,email_a,'accept-test-A');
PERFORM pg_temp.expect_rejection(o,'wrong-token','invite_not_found');
PERFORM pg_temp.expect_rejection(other_org,'accept-test-A','invite_not_found');
PERFORM pg_temp.expect_rejection(o,'accept-test-A','invite_identity_mismatch',b);
UPDATE public.org_billing SET tracker_limit_override=0 WHERE org_id=o;
PERFORM pg_temp.expect_rejection(o,'accept-test-A','tracker_limit_reached');
UPDATE public.org_billing SET tracker_limit_override=1,plan_status='inactive' WHERE org_id=o;
PERFORM pg_temp.expect_rejection(o,'accept-test-A','plan_inactive');
UPDATE public.org_billing SET plan_status='free' WHERE org_id=o;

-- Force failure AFTER canonical membership and its bridges have run.
PERFORM set_config('test.fail_invite',i::text,true);
PERFORM pg_temp.expect_rejection(o,'accept-test-A','injected_accept_write_failure');
IF EXISTS(SELECT 1 FROM public.memberships WHERE org_id=o AND user_id=a)
 OR EXISTS(SELECT 1 FROM public.org_members WHERE org_id=o AND user_id=a)
 OR EXISTS(SELECT 1 FROM public.app_user_roles WHERE org_id=o AND user_id=a)
 OR EXISTS(SELECT 1 FROM public.tracker_invites WHERE id=i AND accepted_at IS NOT NULL) THEN
RAISE EXCEPTION 'Atomic rollback failed'; END IF;
PERFORM set_config('test.fail_invite','',true);
r:=public.accept_tracker_invite_transactional(o,'accept-test-A',a);
IF r->>'already_accepted'<>'false' OR r->>'tracker_user_id'<>a::text THEN RAISE EXCEPTION 'Bad acceptance'; END IF;
first_time:=r->>'accepted_at';
r:=public.accept_tracker_invite_transactional(o,'accept-test-A',a);
IF r->>'already_accepted'<>'true' OR r->>'accepted_at'<>first_time THEN RAISE EXCEPTION 'Retry changed acceptance'; END IF;
IF (SELECT count(*) FROM public.memberships WHERE org_id=o AND role::text='tracker' AND revoked_at IS NULL)<>1
 OR NOT EXISTS(SELECT 1 FROM public.memberships WHERE org_id=other_org AND user_id=a AND role::text='owner')
 OR NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=o AND user_id=a AND role='tracker' AND is_active)
 OR NOT EXISTS(SELECT 1 FROM public.app_user_roles WHERE org_id=o AND user_id=a AND role::text='tracker') THEN
RAISE EXCEPTION 'Membership projection or other org changed'; END IF;
-- First acceptance of another invite for an already-active tracker at capacity.
j:=pg_temp.make_invite(o,email_a,'accept-test-A2');
PERFORM public.accept_tracker_invite_transactional(o,'accept-test-A2',a);
UPDATE public.memberships SET revoked_at=now() WHERE org_id=o AND user_id=a;
PERFORM pg_temp.expect_rejection(o,'accept-test-A2','accepted_membership_not_active_tracker');
IF EXISTS(SELECT 1 FROM public.memberships WHERE org_id=o AND user_id=a AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Retry reactivated user'; END IF;
j:=pg_temp.make_invite(o,email_a,'reactivate-A');
PERFORM public.accept_tracker_invite_transactional(o,'reactivate-A',a);
UPDATE public.tracker_invites SET expires_at=clock_timestamp()-interval '1 second' WHERE id=j;
PERFORM pg_temp.expect_rejection(o,'reactivate-A','invite_expired');
UPDATE public.tracker_invites SET is_active=false WHERE id=j;
PERFORM pg_temp.expect_rejection(o,'reactivate-A','invite_inactive');
j:=pg_temp.make_invite(o,'accept-owner-'||own||'@example.invalid','owner-protected');
PERFORM pg_temp.expect_rejection(o,'owner-protected','inviting_org_owner_protected',own);
j:=pg_temp.make_invite(o,'missing-recipient@example.invalid','no-identity');
PERFORM pg_temp.expect_rejection(o,'no-identity','tracker_user_id_not_resolved');

DELETE FROM public.memberships WHERE org_id=o AND user_id=a;
INSERT INTO public.memberships(org_id,user_id,role) VALUES(o,b,'admin');
j:=pg_temp.make_invite(o,'accept-b-'||b||'@example.invalid','admin-to-tracker');
PERFORM public.accept_tracker_invite_transactional(o,'admin-to-tracker',b);
IF NOT EXISTS(SELECT 1 FROM public.memberships WHERE org_id=o AND user_id=b AND role::text='tracker') THEN RAISE EXCEPTION 'Admin not converted'; END IF;
DELETE FROM public.memberships WHERE org_id=o AND user_id=b;
FOREACH plan IN ARRAY ARRAY['free','pro','enterprise'] LOOP
lim:=CASE plan WHEN 'free' THEN 2 WHEN 'pro' THEN 10 ELSE 50 END;
UPDATE public.org_billing SET plan_code=plan,plan_status=CASE WHEN plan='free' THEN 'free' ELSE 'active' END,
tracker_limit_override=NULL WHERE org_id=o;
FOR n IN 1..lim+1 LOOP
u:=gen_random_uuid(); token:='matrix-'||u;
INSERT INTO auth.users(id,email) VALUES(u,u||'@example.invalid');
j:=pg_temp.make_invite(o,u||'@example.invalid',token);
IF n<=lim THEN PERFORM public.accept_tracker_invite_transactional(o,token,u);
ELSE PERFORM pg_temp.expect_rejection(o,token,'tracker_limit_reached',u);
IF EXISTS(SELECT 1 FROM public.tracker_invites WHERE id=j AND accepted_at IS NOT NULL) THEN RAISE EXCEPTION 'Rejected invite consumed'; END IF;
END IF; END LOOP;
DELETE FROM public.memberships WHERE org_id=o AND role::text='tracker';
END LOOP;
DELETE FROM public.org_billing WHERE org_id=o;
j:=pg_temp.make_invite(o,email_a,'missing-billing');
PERFORM pg_temp.expect_rejection(o,'missing-billing','plan_unavailable');
IF has_function_privilege('anon','public.accept_tracker_invite_transactional(uuid,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.accept_tracker_invite_transactional(uuid,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.accept_tracker_invite_transactional(uuid,text,uuid)','EXECUTE') THEN
RAISE EXCEPTION 'Wrong RPC privileges'; END IF;
END;$test$;
SELECT 'passed' AS result;
ROLLBACK;
