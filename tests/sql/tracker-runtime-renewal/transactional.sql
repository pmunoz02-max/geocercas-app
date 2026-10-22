BEGIN;
DO $$
DECLARE own uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); o uuid; sid uuid; legacy_sid uuid; r jsonb; req uuid:=gen_random_uuid(); v integer; current_access text; current_refresh text; initial_access text := encode(digest('renew-initial-access-'||gen_random_uuid()::text,'sha256'),'hex'); initial_refresh text := encode(digest('renew-initial-refresh-'||gen_random_uuid()::text,'sha256'),'hex'); rotated_access text := encode(digest('renew-rotated-access-'||gen_random_uuid()::text,'sha256'),'hex'); legacy_access text := repeat('d',64); legacy_refresh text := encode(digest('legacy-refresh-'||gen_random_uuid()::text,'sha256'),'hex'); legacy_new_access text := encode(digest('legacy-new-access-'||gen_random_uuid()::text,'sha256'),'hex');
BEGIN
INSERT INTO auth.users(id,email) VALUES(own,'renew-owner-'||own||'@example.invalid'),(u,'renew-'||u||'@example.invalid');
INSERT INTO public.organizations(name,owner_id) VALUES('CODEX renewal rollback',own) RETURNING id INTO o;
UPDATE public.org_billing SET plan_code='free',plan_status='free',tracker_limit_override=1 WHERE org_id=o;
INSERT INTO public.memberships(org_id,user_id,role) VALUES(o,u,'tracker');
INSERT INTO public.tracker_runtime_sessions(org_id,tracker_user_id,access_token_hash,expires_at)
VALUES(o,u,initial_access,now()+interval '1 hour') RETURNING id INTO sid;
r:=public.renew_tracker_runtime_session(initial_access,initial_refresh,rotated_access,o,u,req);
ASSERT r->>'ok'='true','enrollment failed';
SELECT token_version INTO v FROM public.tracker_runtime_sessions WHERE id=sid;
-- same request retry stays idempotent and must keep the current access hash.
r:=public.renew_tracker_runtime_session(initial_access,initial_refresh,rotated_access,o,u,req);
ASSERT r->>'ok'='true','same request retry failed';
ASSERT (SELECT token_version FROM public.tracker_runtime_sessions WHERE id=sid)=v,'retry rotated twice';
-- Lost response: retry the same request_id with the previous valid access hash, same refresh and new hash.
SELECT token_version INTO v FROM public.tracker_runtime_sessions WHERE id=sid;
r:=public.renew_tracker_runtime_session(initial_access,initial_refresh,rotated_access,o,u,req);
ASSERT r->>'ok'='true','lost-response retry failed';
ASSERT (SELECT token_version FROM public.tracker_runtime_sessions WHERE id=sid)=v,'lost-response retry rotated token_version';
-- Independent legacy session: valid access, no refresh, and a fresh hexadecimal refresh candidate.
INSERT INTO public.tracker_runtime_sessions(org_id,tracker_user_id,access_token_hash,expires_at,refresh_token_hash,refresh_expires_at,issued_at)
VALUES(o,u,legacy_access,now()+interval '1 hour',NULL,NULL,now()-interval '2 hours') RETURNING id INTO legacy_sid;
r:=public.renew_tracker_runtime_session(legacy_access,legacy_refresh,legacy_new_access,o,u,gen_random_uuid());
ASSERT r->>'ok'='true','legacy independent session failed';
ASSERT (SELECT access_token_hash FROM public.tracker_runtime_sessions WHERE id=sid)=rotated_access,'sid access was changed';
ASSERT (SELECT refresh_token_hash FROM public.tracker_runtime_sessions WHERE id=sid) IS NOT NULL,'sid refresh was removed';
SELECT access_token_hash, refresh_token_hash INTO current_access, current_refresh FROM public.tracker_runtime_sessions WHERE id=sid;
r:=public.renew_tracker_runtime_session(current_access,current_refresh,repeat('f',64),gen_random_uuid(),u,gen_random_uuid());
ASSERT r->>'ok'='false','cross-org renewal';
ASSERT r->>'error'='session_not_renewable','cross-org renewal should be session_not_renewable';
r:=public.renew_tracker_runtime_session(current_access,current_refresh,repeat('f',64),o,own,gen_random_uuid());
ASSERT r->>'ok'='false','cross-user renewal';
ASSERT r->>'error'='session_not_renewable','cross-user renewal should be session_not_renewable';
UPDATE public.org_billing SET tracker_limit_override=0 WHERE org_id=o;
r:=public.renew_tracker_runtime_session(current_access,current_refresh,repeat('f',64),o,u,gen_random_uuid());
ASSERT r->>'ok'='false','zero limit allowed';
ASSERT r->>'error'='plan_unavailable','zero limit should fail with plan_unavailable';
UPDATE public.org_billing SET tracker_limit_override=1,plan_status='inactive' WHERE org_id=o;
r:=public.renew_tracker_runtime_session(current_access,current_refresh,repeat('f',64),o,u,gen_random_uuid());
ASSERT r->>'ok'='false','inactive plan allowed';
ASSERT r->>'error'='plan_inactive','inactive plan should fail with plan_inactive';
UPDATE public.org_billing SET plan_status='free' WHERE org_id=o;
UPDATE public.memberships SET revoked_at=now() WHERE org_id=o AND user_id=u;
r:=public.renew_tracker_runtime_session(current_access,current_refresh,repeat('f',64),o,u,gen_random_uuid());
ASSERT r->>'ok'='false','revoked membership allowed';
ASSERT r->>'error'='membership_inactive','revoked membership should fail with membership_inactive';
UPDATE public.memberships SET revoked_at=NULL WHERE org_id=o AND user_id=u;
UPDATE public.tracker_runtime_sessions SET active=false,revoked_at=now() WHERE id=sid;
r:=public.renew_tracker_runtime_session(current_access,current_refresh,repeat('f',64),o,u,gen_random_uuid());
ASSERT r->>'ok'='false','revoked session allowed';
ASSERT r->>'error'='session_not_renewable','revoked session should fail with session_not_renewable';
UPDATE public.tracker_runtime_sessions SET active=true,revoked_at=NULL,refresh_expires_at=now()-interval '1 second' WHERE id=sid;
SELECT access_token_hash, refresh_token_hash INTO current_access, current_refresh FROM public.tracker_runtime_sessions WHERE id=sid;
r:=public.renew_tracker_runtime_session(current_access,current_refresh,repeat('f',64),o,u,gen_random_uuid());
ASSERT r->>'ok'='false','expired refresh allowed';
ASSERT r->>'error'='session_not_renewable','expired refresh should fail with session_not_renewable';
ASSERT (SELECT count(*) FROM public.memberships WHERE org_id=o AND role::text='tracker')=1,'renewal consumed capacity';
ASSERT NOT has_function_privilege('anon','public.renew_tracker_runtime_session(text,text,text,uuid,uuid,uuid)','EXECUTE'),'anon can renew';
ASSERT NOT has_function_privilege('authenticated','public.renew_tracker_runtime_session(text,text,text,uuid,uuid,uuid)','EXECUTE'),'user can call privileged RPC';
END $$;

DO $$
DECLARE own uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); o uuid; a uuid; b uuid; r jsonb; old_a_access text; old_a_refresh text; old_a_version integer; old_b_access text; old_b_version integer; a_access_hash text; a_refresh_hash text; b_access_hash text; b_new_access_hash text;
BEGIN
a_access_hash := encode(digest('cross-session-a-access-'||gen_random_uuid()::text,'sha256'),'hex');
a_refresh_hash := encode(digest('cross-session-a-refresh-'||gen_random_uuid()::text,'sha256'),'hex');
b_access_hash := encode(digest('cross-session-b-access-'||gen_random_uuid()::text,'sha256'),'hex');
b_new_access_hash := encode(digest('cross-session-b-new-access-'||gen_random_uuid()::text,'sha256'),'hex');
INSERT INTO auth.users(id,email) VALUES(own,'cross-own-'||own||'@example.invalid'),(u,'cross-user-'||u||'@example.invalid');
INSERT INTO public.organizations(name,owner_id) VALUES('CODEX cross-session',own) RETURNING id INTO o;
UPDATE public.org_billing SET plan_code='free',plan_status='free',tracker_limit_override=1 WHERE org_id=o;
INSERT INTO public.memberships(org_id,user_id,role) VALUES(o,u,'tracker');
INSERT INTO public.tracker_runtime_sessions(org_id,tracker_user_id,access_token_hash,expires_at,refresh_token_hash,refresh_expires_at,issued_at)
VALUES(o,u,a_access_hash,now()+interval '1 hour',a_refresh_hash,now()+interval '30 days',now()-interval '30 minutes') RETURNING id INTO a;
INSERT INTO public.tracker_runtime_sessions(org_id,tracker_user_id,access_token_hash,expires_at,issued_at)
VALUES(o,u,b_access_hash,now()+interval '1 hour',now()-interval '2 minutes') RETURNING id INTO b;
SELECT access_token_hash, refresh_token_hash, token_version INTO old_a_access, old_a_refresh, old_a_version FROM public.tracker_runtime_sessions WHERE id=a;
SELECT access_token_hash, token_version INTO old_b_access, old_b_version FROM public.tracker_runtime_sessions WHERE id=b;
BEGIN
  r:=public.renew_tracker_runtime_session(b_access_hash,a_refresh_hash,b_new_access_hash,o,u,gen_random_uuid());
EXCEPTION WHEN unique_violation THEN
  ASSERT false,'23505 unique_violation on cross-session refresh collision';
END;
ASSERT r->>'ok'='false','refresh of A must be rejected when paired with access of newer B';
ASSERT (SELECT access_token_hash FROM public.tracker_runtime_sessions WHERE id=a)=old_a_access,'older session A was modified';
ASSERT (SELECT refresh_token_hash FROM public.tracker_runtime_sessions WHERE id=a)=old_a_refresh,'older session A refresh hash was modified';
ASSERT (SELECT token_version FROM public.tracker_runtime_sessions WHERE id=a)=old_a_version,'older session A token_version changed';
ASSERT (SELECT access_token_hash FROM public.tracker_runtime_sessions WHERE id=b)=old_b_access,'newer session B was modified';
ASSERT (SELECT token_version FROM public.tracker_runtime_sessions WHERE id=b)=old_b_version,'newer session B token_version changed';
END $$;

DO $$
DECLARE own uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); o uuid; sid uuid; req uuid; r jsonb; old_access text; old_refresh text; old_version integer; foreign_refresh text; new_access text; wrong_new_access text;
BEGIN
foreign_refresh := encode(digest('cross-session-foreign-refresh-'||gen_random_uuid()::text,'sha256'),'hex');
new_access := encode(digest('cross-session-idempotent-new-'||gen_random_uuid()::text,'sha256'),'hex');
wrong_new_access := encode(digest('cross-session-wrong-new-'||gen_random_uuid()::text,'sha256'),'hex');
INSERT INTO auth.users(id,email) VALUES(own,'foreign-own-'||own||'@example.invalid'),(u,'foreign-user-'||u||'@example.invalid');
INSERT INTO public.organizations(name,owner_id) VALUES('CODEX foreign refresh',own) RETURNING id INTO o;
UPDATE public.org_billing SET plan_code='free',plan_status='free',tracker_limit_override=1 WHERE org_id=o;
INSERT INTO public.memberships(org_id,user_id,role) VALUES(o,u,'tracker');
INSERT INTO public.tracker_runtime_sessions(org_id,tracker_user_id,access_token_hash,expires_at,refresh_token_hash,refresh_expires_at,issued_at)
VALUES(o,u,encode(digest('cross-session-own-access-'||gen_random_uuid()::text,'sha256'),'hex'),now()+interval '1 hour',encode(digest('cross-session-own-refresh-'||gen_random_uuid()::text,'sha256'),'hex'),now()+interval '30 days',now()-interval '10 minutes') RETURNING id INTO sid;
SELECT access_token_hash, refresh_token_hash, token_version INTO old_access, old_refresh, old_version FROM public.tracker_runtime_sessions WHERE id=sid;
-- Refresh ajeno: a different refresh token should not be accepted for the current session.
r:=public.renew_tracker_runtime_session(old_access,foreign_refresh,new_access,o,u,gen_random_uuid());
ASSERT r->>'ok'='false','foreign refresh accepted';
ASSERT (SELECT access_token_hash FROM public.tracker_runtime_sessions WHERE id=sid)=old_access,'foreign refresh modified session';
ASSERT (SELECT refresh_token_hash FROM public.tracker_runtime_sessions WHERE id=sid)=old_refresh,'foreign refresh modified refresh hash';
ASSERT (SELECT token_version FROM public.tracker_runtime_sessions WHERE id=sid)=old_version,'foreign refresh changed token_version';
-- Access NULL: should be rejected even when refresh matches a valid session.
r:=public.renew_tracker_runtime_session(NULL,old_refresh,new_access,o,u,gen_random_uuid());
ASSERT r->>'ok'='false','null access accepted';
-- Retry idempotente: same request_id and old access hash should be accepted if it is the same row.
req:=gen_random_uuid();
r:=public.renew_tracker_runtime_session(old_access,old_refresh,new_access,o,u,req);
ASSERT r->>'ok'='true','initial idempotent renewal failed';
old_version := (SELECT token_version FROM public.tracker_runtime_sessions WHERE id=sid);
r:=public.renew_tracker_runtime_session(old_access,old_refresh,new_access,o,u,req);
ASSERT r->>'ok'='true','retry with previous access should stay idempotent';
ASSERT (SELECT token_version FROM public.tracker_runtime_sessions WHERE id=sid)=old_version,'idempotent retry rotated twice';
-- Hash nuevo incorrecto: same request_id but different new hash should be treated as request_expired.
SELECT access_token_hash, refresh_token_hash, token_version INTO old_access, old_refresh, old_version FROM public.tracker_runtime_sessions WHERE id=sid;
r:=public.renew_tracker_runtime_session(old_access,old_refresh,wrong_new_access,o,u,req);
ASSERT r->>'ok'='false','wrong new hash should fail';
ASSERT r->>'error'='request_expired','wrong new hash should be request_expired';
ASSERT (SELECT access_token_hash FROM public.tracker_runtime_sessions WHERE id=sid)=old_access,'request_expired modified access hash';
ASSERT (SELECT refresh_token_hash FROM public.tracker_runtime_sessions WHERE id=sid)=old_refresh,'request_expired modified refresh hash';
ASSERT (SELECT token_version FROM public.tracker_runtime_sessions WHERE id=sid)=old_version,'request_expired modified token_version';
END $$;
ROLLBACK;
