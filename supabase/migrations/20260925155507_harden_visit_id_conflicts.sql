create or replace function public.save_field_visit(p_org uuid,p_user uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare manager boolean; enabled_now boolean; v public.field_visits%rowtype;
 vid uuid; gid uuid; aid uuid; began timestamptz; ended timestamptz;
begin
 if not exists(select 1 from public.organizations where id=p_org and active and not suspended)
 or not exists(select 1 from public.memberships where org_id=p_org and user_id=p_user and revoked_at is null) then
  return jsonb_build_object('error','forbidden');
 end if;
 select exists(select 1 from public.memberships where org_id=p_org and user_id=p_user and revoked_at is null and role::text in ('owner','admin')) into manager;
 -- Serialize activation/deactivation with writes for this organization.
 perform pg_advisory_xact_lock(hashtextextended('field-visits:'||p_org::text,0));
 if p_action='configure' then
  if not manager then return jsonb_build_object('error','forbidden'); end if;
  if jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then return jsonb_build_object('error','invalid_request'); end if;
  insert into public.org_visit_settings(org_id,enabled,updated_by) values(p_org,(p_data->>'enabled')::boolean,p_user)
  on conflict(org_id) do update set enabled=excluded.enabled,updated_by=p_user,updated_at=now();
  return jsonb_build_object('ok',true);
 end if;
 if p_action<>'save' then return jsonb_build_object('error','invalid_request'); end if;
 vid:=(p_data->>'id')::uuid; gid:=(p_data->>'geofence_id')::uuid;
 aid:=nullif(p_data->>'assignment_id','')::uuid;
 began:=(p_data->>'started_at')::timestamptz; ended:=nullif(p_data->>'ended_at','')::timestamptz;
 if vid is null or gid is null or began is null or began>now()+interval '5 minutes'
 or began<now()-interval '30 days' or ended<began or ended>now()+interval '5 minutes' then
  return jsonb_build_object('error','invalid_request');
 end if;
 select * into v from public.field_visits where id=vid for update;
 if found then
  if v.org_id<>p_org or v.user_id<>p_user or v.geofence_id<>gid or v.started_at<>began or v.assignment_id is distinct from aid then
   return jsonb_build_object('error','visit_conflict');
  end if;
  if v.ended_at is not null then
   if v.document is distinct from (p_data->'document') or v.ended_at is distinct from ended then return jsonb_build_object('error','visit_closed'); end if;
   return jsonb_build_object('ok',true,'id',vid);
  end if;
 else
  select enabled into enabled_now from public.org_visit_settings where org_id=p_org;
  if enabled_now is distinct from true then return jsonb_build_object('error','module_disabled'); end if;
  if not exists(select 1 from public.geofences where id=gid and org_id=p_org and active) then return jsonb_build_object('error','invalid_geofence'); end if;
  if aid is not null and not exists(select 1 from public.asignaciones a where a.id=aid and a.org_id=p_org and a.geofence_id=gid and not a.is_deleted
    and (a.user_id=p_user or exists(select 1 from public.personal p where p.id=a.personal_id and p.org_id=p_org and p.user_id=p_user))
    and coalesce(a.status,a.estado,'active') in ('active','activa','activo')
    and (a.start_time is null or a.start_time<=began) and (a.end_time is null or a.end_time>=began)) then return jsonb_build_object('error','invalid_assignment'); end if;
  if not manager and aid is null then return jsonb_build_object('error','assignment_required'); end if;
 end if;
 insert into public.field_visits(id,org_id,user_id,geofence_id,assignment_id,started_at,ended_at,document)
 values(vid,p_org,p_user,gid,aid,began,ended,p_data->'document')
 on conflict(id) do update set ended_at=excluded.ended_at,document=excluded.document,updated_at=now()
 where field_visits.org_id=p_org and field_visits.user_id=p_user;
 if not found then return jsonb_build_object('error','visit_conflict'); end if;
 return jsonb_build_object('ok',true,'id',vid);
end $$;
revoke all on function public.save_field_visit(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_field_visit(uuid,uuid,text,jsonb) to service_role;
