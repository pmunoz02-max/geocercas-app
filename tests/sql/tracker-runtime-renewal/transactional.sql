BEGIN;
DO $$
DECLARE own uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); o uuid; sid uuid; r jsonb; req uuid:=gen_random_uuid(); v integer;
BEGIN
INSERT INTO auth.users(id,email) VALUES(own,'renew-owner-'||own||'@example.invalid'),(u,'renew-'||u||'@example.invalid');
INSERT INTO public.organizations(name,owner_id) VALUES('CODEX renewal rollback',own) RETURNING id INTO o;
UPDATE public.org_billing SET plan_code='free',plan_status='free',tracker_limit_override=1 WHERE org_id=o;
INSERT INTO public.memberships(org_id,user_id,role) VALUES(o,u,'tracker');
INSERT INTO public.tracker_runtime_sessions(org_id,tracker_user_id,access_token_hash,expires_at)
VALUES(o,u,repeat('a',64),now()+interval '1 hour') RETURNING id INTO sid;
r:=public.renew_tracker_runtime_session(repeat('a',64),repeat('b',64),repeat('c',64),o,u,req);
ASSERT r->>'ok'='true','enrollment failed';
SELECT token_version INTO v FROM public.tracker_runtime_sessions WHERE id=sid;
r:=public.renew_tracker_runtime_session(repeat('a',64),repeat('b',64),repeat('c',64),o,u,req);
ASSERT r->>'ok'='true','same request retry failed';
ASSERT (SELECT token_version FROM public.tracker_runtime_sessions WHERE id=sid)=v,'retry rotated twice';
-- Lost response: repeat using the same proof despite the previous access rotating.
r:=public.renew_tracker_runtime_session(repeat('a',64),repeat('b',64),repeat('d',64),o,u,gen_random_uuid());
ASSERT r->>'ok'='true','lost-response retry failed';
UPDATE public.tracker_runtime_sessions SET expires_at=now()-interval '1 day' WHERE id=sid;
r:=public.renew_tracker_runtime_session(NULL,repeat('b',64),repeat('e',64),o,u,gen_random_uuid());
ASSERT r->>'ok'='true','offline recovery failed';
r:=public.renew_tracker_runtime_session(NULL,repeat('b',64),repeat('f',64),gen_random_uuid(),u,gen_random_uuid());
ASSERT r->>'ok'='false','cross-org renewal';
r:=public.renew_tracker_runtime_session(NULL,repeat('b',64),repeat('f',64),o,own,gen_random_uuid());
ASSERT r->>'ok'='false','cross-user renewal';
UPDATE public.org_billing SET tracker_limit_override=0 WHERE org_id=o;
r:=public.renew_tracker_runtime_session(NULL,repeat('b',64),repeat('f',64),o,u,gen_random_uuid());
ASSERT r->>'ok'='false','zero limit allowed';
UPDATE public.org_billing SET tracker_limit_override=1,plan_status='inactive' WHERE org_id=o;
r:=public.renew_tracker_runtime_session(NULL,repeat('b',64),repeat('f',64),o,u,gen_random_uuid());
ASSERT r->>'ok'='false','inactive plan allowed';
UPDATE public.org_billing SET plan_status='free' WHERE org_id=o;
UPDATE public.memberships SET revoked_at=now() WHERE org_id=o AND user_id=u;
r:=public.renew_tracker_runtime_session(NULL,repeat('b',64),repeat('f',64),o,u,gen_random_uuid());
ASSERT r->>'ok'='false','revoked membership allowed';
UPDATE public.memberships SET revoked_at=NULL WHERE org_id=o AND user_id=u;
UPDATE public.tracker_runtime_sessions SET active=false,revoked_at=now() WHERE id=sid;
r:=public.renew_tracker_runtime_session(NULL,repeat('b',64),repeat('f',64),o,u,gen_random_uuid());
ASSERT r->>'ok'='false','revoked session allowed';
UPDATE public.tracker_runtime_sessions SET active=true,revoked_at=NULL,refresh_expires_at=now()-interval '1 second' WHERE id=sid;
r:=public.renew_tracker_runtime_session(NULL,repeat('b',64),repeat('f',64),o,u,gen_random_uuid());
ASSERT r->>'ok'='false','expired refresh allowed';
ASSERT (SELECT count(*) FROM public.memberships WHERE org_id=o AND role::text='tracker')=1,'renewal consumed capacity';
ASSERT NOT has_function_privilege('anon','public.renew_tracker_runtime_session(text,text,text,uuid,uuid,uuid)','EXECUTE'),'anon can renew';
ASSERT NOT has_function_privilege('authenticated','public.renew_tracker_runtime_session(text,text,text,uuid,uuid,uuid)','EXECUTE'),'user can call privileged RPC';
END $$;
ROLLBACK;
