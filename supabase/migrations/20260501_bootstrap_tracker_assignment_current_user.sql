create or replace function public.bootstrap_tracker_assignment_current_user(
  p_user_id uuid,
  p_org_id uuid,
  p_frequency_minutes integer default 5,
  p_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_rowcount integer := 0;
begin

  if p_user_id is null or p_org_id is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'missing_user_or_org'
    );
  end if;

  -- Sincronizar users_public desde auth.users y personal, role 'tracker'
  -- No escribir period ni period_tstz
  insert into public.users_public (
    id,
    email,
    full_name,
    role,
    tenant_id,
    created_at
  )
  select
    u.id,
    lower(u.email),
    coalesce(
      nullif(trim(concat_ws(' ', p.nombre, p.apellido)), ''),
      u.email
    ) as full_name,
    'tracker'::app_role,
    case
      when exists (
        select 1
        from public.tenants t
        where t.id = p.org_id
      )
      then p.org_id
      else null
    end as tenant_id,
    now()
  from auth.users u
  join public.personal p
    on p.user_id = u.id
  where u.id = p_user_id
    and p.org_id = p_org_id
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.users_public.full_name, excluded.full_name),
    role = 'tracker'::app_role,
    tenant_id = coalesce(public.users_public.tenant_id, excluded.tenant_id);

  for r in
    with raw_candidates as (
      select distinct on (p.user_id, a.geofence_id)
        coalesce(a.tenant_id, a.org_id, p.org_id) as tenant_id,
        p.user_id as tracker_user_id,
        a.org_id,
        a.geofence_id,
        a.activity_id,
        coalesce(
          a.start_date,
          (a.start_time at time zone 'UTC')::date,
          current_date
        ) as start_date_raw,
        coalesce(
          a.end_date,
          (a.end_time at time zone 'UTC')::date,
          coalesce((a.start_time at time zone 'UTC')::date, current_date) + p_days
        ) as end_date_raw,
        greatest(
          coalesce(
            a.frequency_minutes,
            ceil(coalesce(a.frecuencia_envio_sec, p_frequency_minutes * 60)::numeric / 60)::integer,
            p_frequency_minutes
          ),
          5
        ) as frequency_minutes,
        a.created_at
      from public.personal p
      join public.users_public up
        on up.id = p.user_id
      join public.asignaciones a
        on a.org_id = p.org_id
       and a.personal_id = p.id
      join public.geofences g
        on g.id = a.geofence_id
       and g.org_id = a.org_id
       and coalesce(g.active, true) = true
      where p.org_id = p_org_id
        and p.user_id = p_user_id
        and coalesce(p.is_deleted, false) = false
        and coalesce(a.is_deleted, false) = false
        and lower(coalesce(a.estado, '')) = 'activa'
        and lower(coalesce(a.status, '')) = 'active'
        and a.geofence_id is not null
      order by p.user_id, a.geofence_id, a.created_at desc
    )
    select
      tenant_id,
      tracker_user_id,
      org_id,
      geofence_id,
      activity_id,
      start_date_raw as start_date,
      greatest(end_date_raw, start_date_raw) as end_date,
      frequency_minutes
    from raw_candidates
  loop
    update public.tracker_assignments
    set
      tenant_id = r.tenant_id,
      org_id = r.org_id,
      activity_id = r.activity_id,
      start_date = r.start_date,
      end_date = r.end_date,
      frequency_minutes = r.frequency_minutes,
      active = true,
      updated_at = now()
    where tracker_user_id = r.tracker_user_id
      and geofence_id = r.geofence_id;

    get diagnostics v_rowcount = row_count;

    if v_rowcount > 0 then
      v_updated := v_updated + v_rowcount;
    else
      begin
        insert into public.tracker_assignments (
          tenant_id,
          tracker_user_id,
          geofence_id,
          start_date,
          end_date,
          frequency_minutes,
          active,
          org_id,
          activity_id,
          updated_at
        )
        values (
          r.tenant_id,
          r.tracker_user_id,
          r.geofence_id,
          r.start_date,
          r.end_date,
          r.frequency_minutes,
          true,
          r.org_id,
          r.activity_id,
          now()
        );

        v_inserted := v_inserted + 1;

      exception when unique_violation then
        update public.tracker_assignments
        set
          tenant_id = r.tenant_id,
          org_id = r.org_id,
          activity_id = r.activity_id,
          start_date = r.start_date,
          end_date = r.end_date,
          frequency_minutes = r.frequency_minutes,
          active = true,
          updated_at = now()
        where tracker_user_id = r.tracker_user_id
          and geofence_id = r.geofence_id;

        get diagnostics v_rowcount = row_count;
        v_updated := v_updated + v_rowcount;
      end;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'updated', v_updated,
    'synced', v_inserted + v_updated,
    'user_id', p_user_id,
    'org_id', p_org_id
  );
end;
$$;