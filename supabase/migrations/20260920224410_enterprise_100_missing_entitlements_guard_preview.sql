BEGIN;
DO $guard$ BEGIN
 IF current_setting('app.env', true) IS DISTINCT FROM 'preview' THEN RAISE EXCEPTION 'Preview session required'; END IF;
END $guard$;
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
  v_row.max_trackers := coalesce(v_row.max_trackers, 0);
    v_row.max_geofences := coalesce(v_row.max_geofences, 0);
    return v_row;
end;
$function$;
COMMIT;
