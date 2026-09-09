-- Prepared only: requires explicit authorization for the target organization.
-- Caller wraps in BEGIN; SET LOCAL app.repair_org_id='authorized UUID'; ... COMMIT;
-- Use ROLLBACK for the first validation. This file grants no memberships/sessions.
DO $repair$
DECLARE
  o uuid := nullif(current_setting('app.repair_org_id',true),'')::uuid;
  inv public.tracker_invites%ROWTYPE;
  person public.personal%ROWTYPE;
  recipient uuid;
  owner_user uuid;
  recipient_email text;
  plan text;
  status text;
  cap integer;
  used bigint;
  changed integer := 0;
BEGIN
  IF o IS NULL THEN RAISE EXCEPTION 'repair_org_required'; END IF;
  SELECT owner_id INTO STRICT owner_user FROM public.organizations WHERE id=o FOR NO KEY UPDATE;
  FOR inv IN SELECT * FROM public.tracker_invites
    WHERE org_id=o AND is_active=true AND role::text='tracker'
      AND accepted_at IS NOT NULL AND used_at IS NOT NULL
      AND used_by_user_id IS NOT NULL AND expires_at>clock_timestamp()
    ORDER BY id FOR UPDATE
  LOOP
    recipient_email := lower(btrim(coalesce(nullif(btrim(inv.email_norm),''),inv.email,'')));
    IF recipient_email='' OR lower(btrim(inv.email)) IS DISTINCT FROM recipient_email THEN
      RAISE EXCEPTION 'invite_identity_mismatch';
    END IF;
    SELECT id INTO STRICT recipient FROM auth.users
      WHERE lower(btrim(email))=recipient_email FOR SHARE;
    IF recipient IS DISTINCT FROM inv.used_by_user_id OR recipient=owner_user THEN
      RAISE EXCEPTION 'invite_identity_mismatch_or_owner';
    END IF;
    BEGIN
      SELECT p.* INTO STRICT person FROM public.personal p
        WHERE p.org_id=o AND coalesce(p.is_deleted,false)=false
          AND lower(btrim(coalesce(nullif(btrim(p.email_norm),''),p.email,'')))=recipient_email
        FOR UPDATE;
    EXCEPTION WHEN no_data_found THEN CONTINUE;
    END;
    IF lower(btrim(person.email)) IS DISTINCT FROM recipient_email
      OR (person.user_id IS NOT NULL AND person.user_id<>recipient)
      OR EXISTS(SELECT 1 FROM public.personal p WHERE p.org_id=o
        AND coalesce(p.is_deleted,false)=false AND p.user_id=recipient AND p.id<>person.id) THEN
      RAISE EXCEPTION 'invite_identity_mismatch';
    END IF;
    SELECT lower(btrim(plan_code)),lower(btrim(coalesce(plan_status,'')))
      INTO STRICT plan,status FROM public.org_billing WHERE org_id=o FOR SHARE;
    IF NOT (status IN ('active','trialing','trial','paid','current','approved')
      OR (plan='free' AND status IN ('free',''))) THEN RAISE EXCEPTION 'plan_inactive'; END IF;
    PERFORM 1 FROM public.plans p WHERE p.code::text=plan FOR SHARE;
    SELECT max_trackers INTO STRICT cap FROM public.org_entitlements WHERE org_id=o;
    PERFORM 1 FROM public.memberships WHERE org_id=o AND user_id=recipient
      AND role::text='tracker' AND revoked_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT count(*) INTO used FROM public.memberships WHERE org_id=o
      AND role::text='tracker' AND revoked_at IS NULL;
    IF cap IS NULL OR cap<=0 OR used>cap THEN RAISE EXCEPTION 'tracker_limit_unavailable'; END IF;
    IF person.user_id IS NULL THEN
      UPDATE public.personal SET user_id=recipient WHERE id=person.id AND org_id=o AND user_id IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'personal_link_not_updated'; END IF;
      changed := changed+1;
    END IF;
  END LOOP;
  PERFORM set_config('app.repaired_personal_count',changed::text,true);
END;
$repair$;
SELECT current_setting('app.repaired_personal_count')::integer AS repaired_personal_count;