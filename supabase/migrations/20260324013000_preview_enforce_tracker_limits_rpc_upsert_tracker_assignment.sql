create or replace function public.rpc_upsert_tracker_assignment(
  p_tracker_user_id uuid,
  p_geofence_id uuid,
  p_frequency_minutes integer,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_org_id uuid;
  v_geofence_org uuid;
  v_has_org_id boolean := false;
  v_has_tenant_id boolean := false;
  v_has_activity_id boolean := false;
  v_has_start_date boolean := false;
  v_has_end_date boolean := false;
  v_has_period boolean := false;
  v_has_period_tstz boolean := false;
  v_has_freq boolean := false;
  v_has_active boolean := false;
  v_has_created_at boolean := false;
  v_has_updated_at boolean := false;

  v_constraint_name text := null;
  cols text := '';
  vals text := '';
  sql_ins text := '';

  v_plan_code text;
  v_max_trackers integer;
  v_current_count integer;
  v_assignment_exists boolean := false;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_geofence_id is null then
    raise exception 'geofence_id required';
  end if;

  -- Detectar columnas existentes en tracker_assignments
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracker_assignments' and column_name = 'org_id'
  ) into v_has_org_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracker_assignments' and column_name = 'tenant_id'
  ) into v_has_tenant_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracker_assignments' and column_name = 'activity_id'
  ) into v_has_activity_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracker_assignments' and column_name = 'start_date'
  ) into v_has_start_date;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracker_assignments' and column_name = 'end_date'
  ) into v_has_end_date;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracker_assignments' and column_name = 'period'
  ) into v_has_period;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracker_assignments' and column_name = 'period_tstz'
  ) into v_has_period_tstz;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracker_assignments' and column_name = 'frequency_minutes'
  ) into v_has_freq;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracker_assignments' and column_name = 'active'
  ) into v_has_active;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracker_assignments' and column_name = 'created_at'
  ) into v_has_created_at;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracker_assignments' and column_name = 'updated_at'
  ) into v_has_updated_at;

  -- Resolver org_id
  if to_regclass('public.gc_get_active_org_id') is not null then
    begin
      v_org_id := public.gc_get_active_org_id();
    exception when others then
      v_org_id := null;
    end;
  end if;

  if v_org_id is null then
    if to_regclass('public.geofences') is not null then
      select g.org_id
      into v_geofence_org
      from public.geofences g
      where g.id = p_geofence_id
      limit 1;
    end if;

    if v_geofence_org is not null then
      if to_regclass('public.gc_is_member_of_org') is not null then
        if public.gc_is_member_of_org(uid, v_geofence_org) then
          v_org_id := v_geofence_org;
        else
          raise exception 'Invalid geofence/geocerca (not member of geofence org)';
        end if;
      else
        v_org_id := v_geofence_org;
      end if;
    else
      raise exception 'Invalid geofence/geocerca (not found)';
    end if;
  end if;

  if p_frequency_minutes is null or p_frequency_minutes < 1 then
    p_frequency_minutes := 5;
  end if;

  if p_active is null then
    p_active := true;
  end if;

  -- Enforcement: leer plan y límite real desde org_entitlements
  select
    oe.plan_code,
    oe.max_trackers
  into
    v_plan_code,
    v_max_trackers
  from public.org_entitlements oe
  where oe.org_id = v_org_id;

  if v_max_trackers is null then
    raise exception 'TRACKER_LIMIT_NOT_DEFINED'
      using errcode = 'P0001',
            detail = jsonb_build_object(
              'code', 'TRACKER_LIMIT_NOT_DEFINED',
              'org_id', v_org_id,
              'operation', 'create_tracker'
            )::text;
  end if;

  -- Si ya existe activo para este org+tracker, no consumir cupo nuevo
  select exists (
    select 1
    from public.tracker_assignments ta
    where ta.org_id = v_org_id
      and ta.tracker_user_id = p_tracker_user_id
      and ta.active = true
  )
  into v_assignment_exists;

  -- Contar trackers activos reales del org
  select count(distinct ta.tracker_user_id)
  into v_current_count
  from public.tracker_assignments ta
  where ta.org_id = v_org_id
    and ta.active = true;

  if not v_assignment_exists and v_current_count >= v_max_trackers then
    raise exception 'TRACKER_LIMIT_REACHED'
      using errcode = 'P0001',
            detail = jsonb_build_object(
              'code', 'TRACKER_LIMIT_REACHED',
              'org_id', v_org_id,
              'plan_code', v_plan_code,
              'operation', 'create_tracker',
              'limit', v_max_trackers,
              'current_count', v_current_count,
              'tracker_user_id', p_tracker_user_id,
              'geofence_id', p_geofence_id,
              'reason', 'tracker_limit_reached'
            )::text,
            hint = 'Upgrade plan to add more trackers';
  end if;

  -- Determinar constraint UNIQUE preferida
  select c.conname
  into v_constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'tracker_assignments'
    and c.contype = 'u'
    and c.conname in ('tracker_assignments_tracker_geofence_uniq', 'tracker_assignments_unique_key')
  order by case c.conname
    when 'tracker_assignments_tracker_geofence_uniq' then 1
    when 'tracker_assignments_unique_key' then 2
    else 99 end
  limit 1;

  cols := 'id, tracker_user_id, geofence_id';
  vals := 'gen_random_uuid(), $1, $2';

  if v_has_tenant_id then
    cols := cols || ', tenant_id';
    vals := vals || ', null';
  end if;

  if v_has_org_id then
    cols := cols || ', org_id';
    vals := vals || ', $3';
  end if;

  if v_has_activity_id then
    cols := cols || ', activity_id';
    vals := vals || ', null';
  end if;

  if v_has_start_date then
    cols := cols || ', start_date';
    vals := vals || ', current_date';
  end if;

  if v_has_end_date then
    cols := cols || ', end_date';
    vals := vals || ', current_date + 30';
  end if;

  if v_has_period then
    cols := cols || ', period';
    vals := vals || ', daterange(current_date, current_date + 30, ''[]'')';
  end if;

  if v_has_period_tstz then
    cols := cols || ', period_tstz';
    vals := vals || ', tstzrange(now(), now() + interval ''30 days'', ''[]'')';
  end if;

  if v_has_freq then
    cols := cols || ', frequency_minutes';
    vals := vals || ', $4';
  end if;

  if v_has_active then
    cols := cols || ', active';
    vals := vals || ', $5';
  end if;

  if v_has_created_at then
    cols := cols || ', created_at';
    vals := vals || ', now()';
  end if;

  if v_has_updated_at then
    cols := cols || ', updated_at';
    vals := vals || ', now()';
  end if;

  sql_ins := 'insert into public.tracker_assignments (' || cols || ') values (' || vals || ') ';

  if v_constraint_name is not null then
    sql_ins := sql_ins || 'on conflict on constraint ' || quote_ident(v_constraint_name) || ' do update set ';
  else
    sql_ins := sql_ins || 'on conflict (tracker_user_id, geofence_id) do update set ';
  end if;

  sql_ins := sql_ins || 'geofence_id = excluded.geofence_id';

  if v_has_org_id then
    sql_ins := sql_ins || ', org_id = excluded.org_id';
  end if;

  if v_has_freq then
    sql_ins := sql_ins || ', frequency_minutes = excluded.frequency_minutes';
  end if;

  if v_has_active then
    sql_ins := sql_ins || ', active = excluded.active';
  end if;

  if v_has_updated_at then
    sql_ins := sql_ins || ', updated_at = now()';
  end if;

  execute sql_ins using p_tracker_user_id, p_geofence_id, v_org_id, p_frequency_minutes, p_active;
end;
$function$;