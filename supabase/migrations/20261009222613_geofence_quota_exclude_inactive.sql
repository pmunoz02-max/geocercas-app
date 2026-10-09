-- Count active geofences consistently with the UI; retain historical rows.
CREATE OR REPLACE FUNCTION public.enforce_geofence_limit_core(p_org_id uuid, p_table_schema text, p_table_name text, p_op text, p_row_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_limit int;
  v_sql text;
  v_count int;
  has_deleted_at boolean;
  has_archived_at boolean;
  has_is_active boolean;
  has_active boolean;
  has_is_deleted boolean;
  has_id boolean;
begin
  if p_org_id is null then
    perform public._log_plan_enforcement(
      null,
      'geofences',
      null,
      null,
      true,
      'no_org_id_skip',
      jsonb_build_object('table', p_table_name, 'op', p_op)
    );
    return;
  end if;

  v_limit := public.get_max_geofences(p_org_id);

  if v_limit is null then
    perform public._log_plan_enforcement(
      p_org_id,
      'geofences',
      null,
      null,
      true,
      'unlimited_or_missing',
      jsonb_build_object('table', p_table_name, 'op', p_op)
    );
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = p_table_schema
      and table_name = p_table_name
      and column_name = 'deleted_at'
  ) into has_deleted_at;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = p_table_schema
      and table_name = p_table_name
      and column_name = 'archived_at'
  ) into has_archived_at;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = p_table_schema
      and table_name = p_table_name
      and column_name = 'is_active'
  ) into has_is_active;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = p_table_schema
      and table_name = p_table_name
      and column_name = 'is_deleted'
  ) into has_is_deleted;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = p_table_schema
      and table_name = p_table_name
      and column_name = 'id'
  ) into has_id;

  v_sql := format(
    'select count(*) from %I.%I where org_id = $1',
    p_table_schema,
    p_table_name
  );

  if has_deleted_at then
    v_sql := v_sql || ' and deleted_at is null';
  end if;

  if has_archived_at then
    v_sql := v_sql || ' and archived_at is null';
  end if;

  if has_is_deleted then
    v_sql := v_sql || ' and (is_deleted is null or is_deleted = false)';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = p_table_schema and table_name = p_table_name
      and column_name = 'active'
  ) into has_active;

  if has_active then
    v_sql := v_sql || ' and active = true';
  end if;

  if has_is_active then
    v_sql := v_sql || ' and (is_active is null or is_active = true)';
  end if;

  if p_op = 'UPDATE' then
    if has_id and p_row_id is not null then
      v_sql := v_sql || ' and id <> $2';
      execute v_sql into v_count using p_org_id, p_row_id;
    else
      execute v_sql into v_count using p_org_id;
    end if;

    perform public.assert_within_plan_limit(
      p_org_id,
      'geofences',
      v_count,
      0,
      jsonb_build_object('table', p_table_name, 'op', p_op)
    );

    return;
  end if;

  execute v_sql into v_count using p_org_id;

  perform public.assert_within_plan_limit(
    p_org_id,
    'geofences',
    v_count,
    1,
    jsonb_build_object('table', p_table_name, 'op', p_op)
  );
end
$function$
;

