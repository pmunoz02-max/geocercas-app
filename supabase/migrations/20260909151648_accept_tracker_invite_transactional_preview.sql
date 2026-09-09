-- PREVIEW draft. NOT APPLIED. Depends on 20260909145100 quota guard.
BEGIN;
CREATE FUNCTION public.accept_tracker_invite_transactional(
  p_org_id uuid,
  p_invite_token text,
  p_expected_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_invite public.tracker_invites%ROWTYPE;
  v_member public.memberships%ROWTYPE;
  v_owner uuid;
  v_user uuid;
  v_hash text;
  v_email text;
  v_plan text;
  v_status text;
  v_limit integer;
  v_used bigint;
  v_has_member boolean;
  v_active_tracker boolean;
  v_retry boolean;
  v_now timestamptz;
BEGIN
  IF p_org_id IS NULL OR p_invite_token IS NULL OR btrim(p_invite_token) = ''
     OR octet_length(p_invite_token) > 4096 THEN
    RAISE EXCEPTION 'invalid_invite_input' USING ERRCODE='P0001';
  END IF;
  IF current_setting('transaction_isolation') NOT IN ('read committed','read uncommitted') THEN
    RAISE EXCEPTION 'membership_limit_requires_read_committed' USING ERRCODE='25001';
  END IF;
  v_hash := encode(sha256(convert_to(btrim(p_invite_token),'UTF8')),'hex');

  -- Same parent lock as enforce_membership_limit; acquired BEFORE membership DML.
  SELECT owner_id INTO v_owner FROM public.organizations
  WHERE id=p_org_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found' USING ERRCODE='P0001';
  END IF;
  BEGIN
    SELECT * INTO STRICT v_invite FROM public.tracker_invites
    WHERE org_id=p_org_id AND invite_token_hash=v_hash FOR UPDATE;
  EXCEPTION
    WHEN no_data_found THEN RAISE EXCEPTION 'invite_not_found' USING ERRCODE='P0001';
    WHEN too_many_rows THEN RAISE EXCEPTION 'invite_ambiguous' USING ERRCODE='P0001';
  END;
  v_now := clock_timestamp(); -- expiry checked after waiting for locks
  IF v_invite.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'invite_inactive' USING ERRCODE='P0001';
  END IF;
  IF v_invite.expires_at IS NULL OR v_invite.expires_at <= v_now THEN
    RAISE EXCEPTION 'invite_expired' USING ERRCODE='P0001';
  END IF;
  IF v_invite.role IS NOT NULL AND v_invite.role::text <> 'tracker' THEN
    RAISE EXCEPTION 'invite_role_mismatch' USING ERRCODE='P0001';
  END IF;
  v_email := lower(btrim(coalesce(nullif(btrim(v_invite.email_norm),''),v_invite.email,'')));
  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'invite_identity_unavailable' USING ERRCODE='P0001';
  END IF;
  IF nullif(btrim(v_invite.email),'') IS NOT NULL
     AND lower(btrim(v_invite.email)) <> v_email THEN
    RAISE EXCEPTION 'invite_identity_mismatch' USING ERRCODE='P0001';
  END IF;
  -- Resolve from the recipient, never from an arbitrary tracker in the org.
  -- Hold a SHARE lock so Auth email cannot change during acceptance.
  BEGIN
    SELECT u.id INTO STRICT v_user FROM auth.users u
    WHERE lower(btrim(u.email))=v_email FOR SHARE;
  EXCEPTION
    WHEN no_data_found THEN RAISE EXCEPTION 'tracker_user_id_not_resolved' USING ERRCODE='P0001';
    WHEN too_many_rows THEN RAISE EXCEPTION 'invite_identity_ambiguous' USING ERRCODE='P0001';
  END;
  IF p_expected_user_id IS NOT NULL AND p_expected_user_id <> v_user THEN
    RAISE EXCEPTION 'invite_identity_mismatch' USING ERRCODE='P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.personal p WHERE p.org_id=p_org_id
      AND lower(btrim(coalesce(nullif(btrim(p.email_norm),''),p.email,'')))=v_email
      AND coalesce(p.is_deleted,false)=false AND p.user_id IS NOT NULL
      AND p.user_id<>v_user
  ) THEN
    RAISE EXCEPTION 'invite_identity_mismatch' USING ERRCODE='P0001';
  END IF;
  IF v_user=v_owner THEN
    RAISE EXCEPTION 'inviting_org_owner_protected' USING ERRCODE='P0001';
  END IF;

  SELECT lower(btrim(b.plan_code)), lower(btrim(coalesce(b.plan_status,'')))
  INTO v_plan,v_status FROM public.org_billing b WHERE b.org_id=p_org_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_unavailable' USING ERRCODE='P0001'; END IF;
  IF v_status IN ('active','trialing','trial','paid','current','approved') THEN
    v_status := 'active';
  ELSIF v_status IN ('free','') THEN v_status := 'free';
  ELSE v_status := 'inactive'; END IF;
  IF NOT (v_status='active' OR (v_plan='free' AND v_status='free')) THEN
    RAISE EXCEPTION 'plan_inactive' USING ERRCODE='P0001';
  END IF;
  PERFORM 1 FROM public.plans p JOIN public.org_billing b ON p.code::text=b.plan_code
  WHERE b.org_id=p_org_id FOR SHARE OF p;
  BEGIN
    SELECT oe.max_trackers INTO STRICT v_limit FROM public.org_entitlements oe
    WHERE oe.org_id=p_org_id AND lower(btrim(oe.plan_code))=v_plan;
  EXCEPTION
    WHEN no_data_found OR too_many_rows THEN
      RAISE EXCEPTION 'plan_unavailable' USING ERRCODE='P0001';
  END;
  IF v_limit IS NULL OR v_limit < 0 THEN
    RAISE EXCEPTION 'plan_unavailable' USING ERRCODE='P0001';
  END IF;

  SELECT * INTO v_member FROM public.memberships
  WHERE org_id=p_org_id AND user_id=v_user FOR UPDATE;
  v_has_member := FOUND;
  v_active_tracker := v_has_member AND v_member.role::text='tracker' AND v_member.revoked_at IS NULL;
  IF v_has_member AND v_member.role::text='owner' THEN
    RAISE EXCEPTION 'inviting_org_owner_protected' USING ERRCODE='P0001';
  END IF;
  v_retry := v_invite.accepted_at IS NOT NULL OR v_invite.used_at IS NOT NULL
             OR v_invite.used_by_user_id IS NOT NULL;
  IF v_retry THEN
    IF v_invite.accepted_at IS NULL OR v_invite.used_at IS NULL
       OR v_invite.used_by_user_id IS DISTINCT FROM v_user THEN
      RAISE EXCEPTION 'invite_already_used_or_inconsistent' USING ERRCODE='P0001';
    END IF;
    IF NOT v_active_tracker THEN
      RAISE EXCEPTION 'accepted_membership_not_active_tracker' USING ERRCODE='P0001';
    END IF;
  END IF;
  SELECT count(*) INTO v_used FROM public.memberships
  WHERE org_id=p_org_id AND role::text='tracker' AND revoked_at IS NULL;
  IF v_limit=0 OR v_used>v_limit OR (NOT v_active_tracker AND v_used>=v_limit) THEN
    RAISE EXCEPTION 'tracker_limit_reached' USING ERRCODE='P0001';
  END IF;
  -- Billing/Auth/member locks may have waited; do not accept an expired link.
  v_now := clock_timestamp();
  IF v_invite.expires_at <= v_now THEN
    RAISE EXCEPTION 'invite_expired' USING ERRCODE='P0001';
  END IF;
  IF v_retry THEN
    RETURN jsonb_build_object('ok',true,'already_accepted',true,'invite_id',v_invite.id,
      'org_id',p_org_id,'tracker_user_id',v_user,'accepted_at',v_invite.accepted_at);
  END IF;

  -- Only the canonical membership is changed; existing bridges project it.
  IF NOT v_has_member THEN
    INSERT INTO public.memberships(org_id,user_id,role,revoked_at,is_default)
    VALUES(p_org_id,v_user,'tracker',NULL,false);
  ELSIF NOT v_active_tracker THEN
    UPDATE public.memberships SET role='tracker',revoked_at=NULL
    WHERE org_id=p_org_id AND user_id=v_user;
  END IF;
  -- Existing active trackers at capacity are not rewritten or counted twice.
  UPDATE public.tracker_invites SET accepted_at=v_now,used_at=v_now,
    used_by_user_id=v_user,role='tracker'
  WHERE id=v_invite.id AND org_id=p_org_id;
  RETURN jsonb_build_object('ok',true,'already_accepted',false,'invite_id',v_invite.id,
    'org_id',p_org_id,'tracker_user_id',v_user,'accepted_at',v_now);
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_tracker_invite_transactional(uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_tracker_invite_transactional(uuid,text,uuid) FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tracker_invite_transactional(uuid,text,uuid) TO service_role;
COMMENT ON FUNCTION public.accept_tracker_invite_transactional(uuid,text,uuid)
IS 'Backend-only tracker invitation acceptance; validates recipient and token, locks org, writes membership and acceptance atomically. Does not issue sessions.';
COMMIT;
