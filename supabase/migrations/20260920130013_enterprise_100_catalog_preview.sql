-- PREVIEW ONLY: mujwsfhkocsuuahlrssn. Apply after the enum step commits.
-- Audited against Preview on 2026-09-20. No organization subscription updates.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $guard$ BEGIN
  IF current_setting('app.env', true) IS DISTINCT FROM 'preview' THEN
    RAISE EXCEPTION 'Preview migration refused in production';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_enum WHERE enumtypid='public.plan_code'::regtype AND enumlabel='enterprise_100') THEN
    RAISE EXCEPTION 'Apply and commit enum step first';
  END IF;
END $guard$;
INSERT INTO public.plans(code,name,geofence_limit,tracker_limit,price_month_usd)
VALUES ('enterprise_100','ENTERPRISE 100',250,100,169)
ON CONFLICT(code) DO UPDATE SET name=excluded.name,geofence_limit=excluded.geofence_limit,
tracker_limit=excluded.tracker_limit,price_month_usd=excluded.price_month_usd;
-- Feature policy: inherit the existing paid feature policy; limits remain catalog based.
INSERT INTO public.plan_entitlements(plan_code,max_trackers,max_geofences,max_members,history_days,reports_enabled,exports_enabled,active)
SELECT 'enterprise_100',100,250,max_members,history_days,reports_enabled,exports_enabled,true
FROM public.plan_entitlements WHERE plan_code='pro' AND active
ON CONFLICT(plan_code) DO UPDATE SET max_trackers=100,max_geofences=250,
history_days=excluded.history_days,reports_enabled=excluded.reports_enabled,exports_enabled=excluded.exports_enabled,active=true;
CREATE OR REPLACE FUNCTION public.apply_auto_downgrade_from_billing(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_current_plan_code text;
  v_subscribed_plan_code text;
  v_plan_status text;
  v_cancel_at_period_end boolean;
  v_effective_plan text;
  v_limits jsonb;
begin
  select
    public.normalize_plan_code(ob.plan_code),
    public.normalize_plan_code(coalesce(ob.subscribed_plan_code, ob.plan_code)),
    public.map_stripe_status_to_plan_status(ob.plan_status, ob.cancel_at_period_end),
    coalesce(ob.cancel_at_period_end, false)
  into
    v_current_plan_code,
    v_subscribed_plan_code,
    v_plan_status,
    v_cancel_at_period_end
  from public.org_billing ob
  where ob.org_id = p_org_id
  limit 1;

  if v_current_plan_code is null then
    raise exception 'org_billing not found for org_id=%', p_org_id;
  end if;

  -- Si el webhook acaba de grabar un plan pagado real, lo preservamos aquí.
  if v_current_plan_code in ('pro', 'enterprise', 'enterprise_100') then
    v_subscribed_plan_code := v_current_plan_code;
  end if;

  v_effective_plan := public.resolve_effective_plan_code(
    v_subscribed_plan_code,
    v_plan_status
  );

  update public.org_billing
  set
    subscribed_plan_code = v_subscribed_plan_code,
    plan_code = v_effective_plan,
    plan_status = v_plan_status,
    updated_at = now()
  where org_id = p_org_id
    and (
      coalesce(subscribed_plan_code, '') is distinct from coalesce(v_subscribed_plan_code, '')
      or coalesce(plan_code, '') is distinct from coalesce(v_effective_plan, '')
      or coalesce(plan_status, '') is distinct from coalesce(v_plan_status, '')
    );

  v_limits := public.refresh_org_limit_status(p_org_id);

  perform public.log_billing_guard_event(
    p_org_id,
    'billing',
    'auto_downgrade_applied',
    null,
    null,
    jsonb_build_object(
      'subscribed_plan_code', v_subscribed_plan_code,
      'effective_plan_code', v_effective_plan,
      'plan_status', v_plan_status,
      'cancel_at_period_end', v_cancel_at_period_end,
      'limits', v_limits
    )
  );

  return jsonb_build_object(
    'ok', true,
    'org_id', p_org_id,
    'subscribed_plan_code', v_subscribed_plan_code,
    'effective_plan_code', v_effective_plan,
    'plan_status', v_plan_status,
    'cancel_at_period_end', v_cancel_at_period_end,
    'limits', v_limits
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_best_plan_from_play(org_id_in uuid)
 RETURNS plan_code
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with active_purchases as (
    select pp.*
    from public.play_purchases pp
    where pp.org_id = org_id_in
      and pp.status = 'active'
      and (
        pp.expiry_time is null
        or pp.expiry_time > now()
      )
  ),
  mapped as (
    select
      ap.id,
      pr.plan_code
    from active_purchases ap
    join public.play_products pr
      on pr.product_id = ap.product_id
     and pr.active = true
    join public.plans p
      on p.code = pr.plan_code
  ),
  ranked as (
    select
      plan_code,
      case plan_code
        when 'free' then 0
        when 'pro' then 20
        when 'enterprise' then 30
        when 'enterprise_100' then 40
        else -1
      end as rank
    from mapped
  )
  select plan_code
  from ranked
  where rank >= 0
  order by rank desc
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_plan_code(p_plan text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v text := lower(trim(coalesce(p_plan, 'free')));
begin
  if v in ('free', 'pro', 'enterprise', 'enterprise_100') then
    return v;
  end if;
  return 'free';
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_plan_entitlements(p_org_id uuid)
 RETURNS plan_entitlements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan text;
  v_row public.plan_entitlements;
begin
  v_plan := public.get_org_plan_code(p_org_id);

  select *
    into v_row
  from public.plan_entitlements pe
  where pe.plan_code = v_plan and pe.active = true;

  -- fallback robusto: si no hay fila del plan, usa 'free'
  if v_row.plan_code is null then
    select *
      into v_row
    from public.plan_entitlements pe
    where pe.plan_code = 'free' and pe.active = true;
  end if;

  -- Quotas always come from the official catalog, including org overrides.
  select oe.max_trackers, oe.max_geocercas
    into v_row.max_trackers, v_row.max_geofences
  from public.org_entitlements oe where oe.org_id = p_org_id;
  return v_row;
end;
$function$;

DO $verify$ BEGIN
 IF public.normalize_plan_code('enterprise_100') <> 'enterprise_100' THEN RAISE EXCEPTION 'Normalization failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.plan_entitlements WHERE plan_code='enterprise_100' AND active) THEN RAISE EXCEPTION 'Paid feature policy missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.plans WHERE code::text='enterprise_100' AND tracker_limit=100 AND geofence_limit=250 AND price_month_usd=169) THEN RAISE EXCEPTION 'Catalog mismatch'; END IF;
END $verify$;
COMMIT;

