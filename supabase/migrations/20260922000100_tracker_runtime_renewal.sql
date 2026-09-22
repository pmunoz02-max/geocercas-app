-- Preview first. Additive: existing sessions enroll only with an unexpired access token.
ALTER TABLE public.tracker_runtime_sessions
  ADD COLUMN IF NOT EXISTS refresh_token_hash text,
  ADD COLUMN IF NOT EXISTS refresh_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_request_id uuid;
-- Runtime credentials are backend-only; clients use the HTTP endpoint.
ALTER TABLE public.tracker_runtime_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tracker_runtime_sessions FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS tracker_runtime_access_hash_idx ON public.tracker_runtime_sessions(access_token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS tracker_runtime_refresh_hash_unique
 ON public.tracker_runtime_sessions(refresh_token_hash) WHERE refresh_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.renew_tracker_runtime_session(
 p_access_hash text, p_refresh_hash text, p_new_access_hash text,
 p_org_id uuid, p_tracker_user_id uuid, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.tracker_runtime_sessions%ROWTYPE; b public.org_billing%ROWTYPE;
BEGIN
 IF p_request_id IS NULL OR p_refresh_hash IS NULL OR p_refresh_hash !~ '^[0-9a-f]{64}$'
 OR p_new_access_hash IS NULL OR p_new_access_hash !~ '^[0-9a-f]{64}$' THEN
   RETURN jsonb_build_object('ok',false,'error','invalid_request');
 END IF;
 -- Stable refresh proof makes retries safe after a lost response; serialize rotation.
 SELECT * INTO s FROM public.tracker_runtime_sessions
 WHERE org_id=p_org_id AND tracker_user_id=p_tracker_user_id
 AND (refresh_token_hash=p_refresh_hash OR
      (refresh_token_hash IS NULL AND access_token_hash=p_access_hash AND expires_at>now()))
 ORDER BY issued_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR NOT s.active OR s.revoked_at IS NOT NULL
 OR (s.refresh_token_hash IS NOT NULL AND (s.refresh_expires_at IS NULL OR s.refresh_expires_at<=now())) THEN
   RETURN jsonb_build_object('ok',false,'error','session_not_renewable');
 END IF;
 PERFORM 1 FROM public.memberships WHERE org_id=s.org_id AND user_id=s.tracker_user_id
 AND role::text='tracker' AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','membership_inactive'); END IF;
 SELECT * INTO b FROM public.org_billing WHERE org_id=s.org_id FOR SHARE;
 IF NOT FOUND OR NOT (
   lower(trim(coalesce(b.plan_status,''))) IN ('active','trialing','trial','paid','current','approved')
   OR (lower(trim(b.plan_code))='free' AND lower(trim(coalesce(b.plan_status,''))) IN ('free',''))
 ) THEN RETURN jsonb_build_object('ok',false,'error','plan_inactive'); END IF;
 IF NOT EXISTS (SELECT 1 FROM public.org_entitlements WHERE org_id=s.org_id AND max_trackers>0) THEN
   RETURN jsonb_build_object('ok',false,'error','plan_unavailable');
 END IF;
 IF s.renewal_request_id=p_request_id THEN
   IF s.access_token_hash<>p_new_access_hash OR s.expires_at<=now() THEN
     RETURN jsonb_build_object('ok',false,'error','request_expired');
   END IF;
   RETURN jsonb_build_object('ok',true,'org_id',s.org_id,'tracker_user_id',s.tracker_user_id,
     'expires_in',floor(extract(epoch from s.expires_at-now()))::integer);
 END IF;
 UPDATE public.tracker_runtime_sessions SET access_token_hash=p_new_access_hash, renewal_request_id=p_request_id,
 refresh_token_hash=p_refresh_hash, refresh_expires_at=now()+interval '30 days',
 expires_at=now()+interval '24 hours', token_version=token_version+1, updated_at=now()
 WHERE id=s.id;
 RETURN jsonb_build_object('ok',true,'org_id',s.org_id,'tracker_user_id',s.tracker_user_id,
 'expires_in',86400,'refresh_expires_in',2592000);
END $$;
REVOKE ALL ON FUNCTION public.renew_tracker_runtime_session(text,text,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.renew_tracker_runtime_session(text,text,text,uuid,uuid,uuid) TO service_role;
