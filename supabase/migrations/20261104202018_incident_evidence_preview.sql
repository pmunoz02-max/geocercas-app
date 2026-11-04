-- Preview only. Evidence is reserved before upload; replay never creates a new slot.
alter table public.incident_evidence add column uploaded boolean not null default false;
alter table public.incident_evidence add column attachment_location jsonb;
create unique index incident_evidence_incident_slot on public.incident_evidence(org_id,incident_id,slot);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('incident-evidence','incident-evidence',false,2097152,array['image/jpeg','image/png']);

create function public.reserve_incident_evidence(p_org uuid,p_actor uuid,p_incident uuid,p_observation uuid,p_evidence uuid,p_meta jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare role_name text; item public.incidents%rowtype; prior public.incident_evidence%rowtype; n integer; expected_path text;
begin
 role_name:=public.incident_actor_role(p_org,p_actor);
 select * into item from public.incidents where org_id=p_org and id=p_incident for update;
 if not found or (role_name not in ('owner','admin') and item.author_id<>p_actor) then raise exception 'forbidden' using errcode='42501'; end if;
 if not exists(select 1 from public.incident_observations where org_id=p_org and incident_id=p_incident and id=p_observation and author_id=p_actor) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_evidence is null or jsonb_typeof(p_meta) is distinct from 'object' or p_meta-array['sha256','mime_type','byte_size','attached_at','location']<>'{}'::jsonb
 or coalesce(p_meta->>'sha256','') !~ '^[0-9a-f]{64}$' or coalesce(p_meta->>'mime_type','') not in ('image/jpeg','image/png')
 or coalesce((p_meta->>'byte_size')::int,0) not between 1 and 2097152
 or (p_meta->>'attached_at') is null or not isfinite((p_meta->>'attached_at')::timestamptz) or (p_meta->>'attached_at')::timestamptz>now()+interval '5 minutes'
 then raise exception 'invalid_photo' using errcode='22023'; end if;
 expected_path:=p_org::text||'/'||p_incident::text||'/'||p_evidence::text||'/'||(p_meta->>'sha256');
 select * into prior from public.incident_evidence where id=p_evidence;
 if found then
  if prior.org_id<>p_org or prior.incident_id<>p_incident or prior.observation_id<>p_observation or prior.object_path<>expected_path
  or prior.mime_type<>p_meta->>'mime_type' or prior.byte_size<>(p_meta->>'byte_size')::int or prior.attached_at<>(p_meta->>'attached_at')::timestamptz
  or prior.attachment_location is distinct from nullif(p_meta->'location','null'::jsonb)
  then raise exception 'operation_conflict' using errcode='40001'; end if;
  return to_jsonb(prior);
 end if;
 if item.status='closed' then raise exception 'incident_closed' using errcode='22023'; end if;
 if not exists(select 1 from public.org_incident_settings where org_id=p_org and enabled) then raise exception 'module_disabled' using errcode='42501'; end if;
 select count(*) into n from public.incident_evidence where org_id=p_org and incident_id=p_incident;
 if n>=5 then raise exception 'photo_limit' using errcode='22023'; end if;
 insert into public.incident_evidence(id,org_id,incident_id,observation_id,slot,object_path,sha256,mime_type,byte_size,attached_at,attachment_location)
 values(p_evidence,p_org,p_incident,p_observation,n+1,expected_path,p_meta->>'sha256',p_meta->>'mime_type',(p_meta->>'byte_size')::int,(p_meta->>'attached_at')::timestamptz,nullif(p_meta->'location','null'::jsonb)) returning * into prior;
 return to_jsonb(prior);
end $$;
create function public.finish_incident_evidence(p_org uuid,p_actor uuid,p_evidence uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.incident_actor_role(p_org,p_actor);
 update public.incident_evidence e set uploaded=true where e.org_id=p_org and e.id=p_evidence and exists
 (select 1 from public.incident_observations o where o.org_id=p_org and o.id=e.observation_id and o.author_id=p_actor);
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('ok',true,'id',p_evidence);
end $$;
revoke all on function public.reserve_incident_evidence(uuid,uuid,uuid,uuid,uuid,jsonb),public.finish_incident_evidence(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_incident_evidence(uuid,uuid,uuid,uuid,uuid,jsonb),public.finish_incident_evidence(uuid,uuid,uuid) to service_role;

create or replace function public.save_incident_core(p_org uuid,p_actor uuid,p_operation uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; manager boolean; saved public.incidents%rowtype; prior public.incident_operations%rowtype;
 result jsonb; digest text; iid uuid; gid uuid; vid uuid; observed timestamptz; captured timestamptz;
 target text; note text; fence_name text; expected bigint; enabled_now boolean; observation uuid;
begin
 if p_operation is null or jsonb_typeof(p_data) is distinct from 'object' or p_action is null
 or p_action not in ('configure','create','observe','transition') then
 raise exception 'invalid_request' using errcode='22023'; end if;
 r:=public.incident_actor_role(p_org,p_actor); manager:=r in ('owner','admin');
 perform pg_advisory_xact_lock(hashtextextended('incidents:'||p_org::text,0));
 digest:=encode(extensions.digest(jsonb_build_object('action',p_action,'body',p_data)::text,'sha256'),'hex');
 select * into prior from public.incident_operations where org_id=p_org and actor_id=p_actor and operation_id=p_operation;
 if found then
  if prior.request_hash<>digest then raise exception 'operation_conflict' using errcode='40001'; end if;
  return prior.response;
 end if;
 if p_action='configure' then
  if not manager then raise exception 'forbidden' using errcode='42501'; end if;
  if p_data-'enabled'<>'{}'::jsonb or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then
   raise exception 'invalid_request' using errcode='22023'; end if;
  insert into public.org_incident_settings(org_id,enabled,updated_by) values(p_org,(p_data->>'enabled')::boolean,p_actor)
  on conflict(org_id) do update set enabled=excluded.enabled,updated_by=p_actor,updated_at=now();
  result:=jsonb_build_object('ok',true,'enabled',(p_data->>'enabled')::boolean,'operation_id',p_operation);
 else
  iid:=(p_data->>'id')::uuid;
  if iid is null then raise exception 'invalid_id' using errcode='22023'; end if;
  note:=coalesce(p_data->>'note','');
  if length(note)>4000 then raise exception 'invalid_note' using errcode='22023'; end if;
  select enabled into enabled_now from public.org_incident_settings where org_id=p_org;
  if p_action='create' then
   if p_data-array['id','geofence_id','visit_id','title','category','severity','lat','lng','accuracy_m','location_source','captured_at','observed_at','note']<>'{}'::jsonb then
    raise exception 'unsupported_fields' using errcode='22023'; end if;
   if enabled_now is distinct from true then raise exception 'module_disabled' using errcode='42501'; end if;
   gid:=(p_data->>'geofence_id')::uuid; vid:=nullif(p_data->>'visit_id','')::uuid;
   observed:=(p_data->>'observed_at')::timestamptz; captured:=(p_data->>'captured_at')::timestamptz;
   if observed is null or captured is null or not isfinite(observed) or not isfinite(captured)
    or observed>now()+interval '5 minutes' or captured>now()+interval '5 minutes' then
    raise exception 'invalid_time' using errcode='22023'; end if;
   if p_data->>'location_source' is distinct from 'gps' then raise exception 'gps_required' using errcode='22023'; end if;
   select name into fence_name from public.geofences where id=gid and org_id=p_org and active for share;
   if not found then raise exception 'invalid_geofence' using errcode='42501'; end if;
   if vid is not null and not exists(select 1 from public.field_visits where id=vid and org_id=p_org and geofence_id=gid and (manager or user_id=p_actor)) then
    raise exception 'invalid_visit' using errcode='42501'; end if;
   if not manager and not exists (
    select 1 from public.asignaciones a where a.org_id=p_org and a.geofence_id=gid and not coalesce(a.is_deleted,false)
    and coalesce(a.status,a.estado,'') in ('active','activa','activo')
    and (a.user_id=p_actor or exists(select 1 from public.personal p where p.id=a.personal_id and p.org_id=p_org and p.user_id=p_actor))
    and (a.start_time is null or a.start_time<=observed) and (a.end_time is null or a.end_time>=observed)
    and (a.end_time is null or a.end_time>=now())
   ) then raise exception 'assignment_required' using errcode='42501'; end if;
   insert into public.incidents(id,org_id,author_id,geofence_id,geofence_name_snapshot,visit_id,title,category,severity,lat,lng,accuracy_m,location_source,captured_at,observed_at)
   values(iid,p_org,p_actor,gid,fence_name,vid,p_data->>'title',p_data->>'category',p_data->>'severity',
    (p_data->>'lat')::numeric,(p_data->>'lng')::numeric,(p_data->>'accuracy_m')::numeric,'gps',captured,observed)
   returning * into saved;
   insert into public.incident_observations(id,org_id,incident_id,author_id,note,observed_at)
   values(gen_random_uuid(),p_org,iid,p_actor,note,observed) returning id into observation;
   insert into public.incident_events(id,org_id,incident_id,actor_id,event_type,to_status)
   values(gen_random_uuid(),p_org,iid,p_actor,'created','detected');
  else
   select * into saved from public.incidents where org_id=p_org and id=iid for update;
   if not found or (not manager and saved.author_id<>p_actor) then raise exception 'forbidden' using errcode='42501'; end if;
   expected:=(p_data->>'expected_version')::bigint;
   if expected is distinct from saved.version then raise exception 'version_conflict' using errcode='40001'; end if;
   if p_action='observe' then
    if p_data-array['id','expected_version','note','observed_at']<>'{}'::jsonb then raise exception 'unsupported_fields' using errcode='22023'; end if;
    if saved.status='closed' then raise exception 'incident_closed' using errcode='22023'; end if;
    if not manager and enabled_now is distinct from true then raise exception 'module_disabled' using errcode='42501'; end if;
    observed:=(p_data->>'observed_at')::timestamptz;
    if observed is null or not isfinite(observed) or observed>now()+interval '5 minutes' or length(trim(note))=0 then raise exception 'invalid_observation' using errcode='22023'; end if;
    insert into public.incident_observations(id,org_id,incident_id,author_id,note,observed_at) values(gen_random_uuid(),p_org,iid,p_actor,note,observed) returning id into observation;
    insert into public.incident_events(id,org_id,incident_id,actor_id,event_type) values(gen_random_uuid(),p_org,iid,p_actor,'observed');
   else
    if not manager then raise exception 'forbidden' using errcode='42501'; end if;
    if p_data-array['id','expected_version','status','reason']<>'{}'::jsonb then raise exception 'unsupported_fields' using errcode='22023'; end if;
    target:=p_data->>'status'; note:=coalesce(p_data->>'reason','');
    if target is null or not ((saved.status='detected' and target in ('treating','closed')) or (saved.status='treating' and target in ('controlled','closed')) or (saved.status='controlled' and target in ('treating','closed')) or (saved.status='closed' and target='detected')) then raise exception 'invalid_transition' using errcode='22023'; end if;
    if length(trim(note)) not between 1 and 4000 then raise exception 'reason_required' using errcode='22023'; end if;
    insert into public.incident_events(id,org_id,incident_id,actor_id,event_type,from_status,to_status,reason)
    values(gen_random_uuid(),p_org,iid,p_actor,case when saved.status='closed' then 'reopened' else 'status_changed' end,saved.status,target,note);
    saved.status:=target;
   end if;
   update public.incidents set status=saved.status,version=version+1,updated_at=now() where id=iid returning * into saved;
  end if;
  result:=jsonb_build_object('ok',true,'id',saved.id,'version',saved.version,'operation_id',p_operation,'received_at',saved.received_at,'photos_supported',true,'observation_id',observation);
 end if;
 insert into public.incident_operations(org_id,actor_id,operation_id,request_hash,response) values(p_org,p_actor,p_operation,digest,result);
 return result;
end $$;
revoke all on function public.save_incident_core(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_incident_core(uuid,uuid,uuid,text,jsonb) to service_role;


create or replace function public.read_incident_core(p_org uuid,p_actor uuid,p_id uuid default null,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; manager boolean; result jsonb;
begin
 r:=public.incident_actor_role(p_org,p_actor); manager:=r in ('owner','admin');
 if (p_before is null) <> (p_before_id is null) then raise exception 'invalid_cursor' using errcode='22023'; end if;
 if p_id is not null then
  select to_jsonb(i) into result from public.incidents i where org_id=p_org and id=p_id and (manager or author_id=p_actor);
  if result is null then raise exception 'forbidden' using errcode='42501'; end if;
  return jsonb_build_object('incident',result,'observations',coalesce((select jsonb_agg(to_jsonb(o) order by received_at,id) from public.incident_observations o where org_id=p_org and incident_id=p_id),'[]'::jsonb),
   'evidence',coalesce((select jsonb_agg(to_jsonb(e) order by slot) from public.incident_evidence e where org_id=p_org and incident_id=p_id),'[]'::jsonb),
   'events',coalesce((select jsonb_agg(to_jsonb(e) order by created_at,id) from public.incident_events e where org_id=p_org and incident_id=p_id),'[]'::jsonb));
 end if;
 select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) into result from (
  select * from public.incidents where org_id=p_org and (manager or author_id=p_actor)
  and (p_before is null or (received_at,id)<(p_before,p_before_id)) order by received_at desc,id limit 100
 ) i;
 return jsonb_build_object('items',result,'enabled',coalesce((select enabled from public.org_incident_settings where org_id=p_org),false),'manager',manager);
end $$;
revoke all on function public.read_incident_core(uuid,uuid,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.read_incident_core(uuid,uuid,uuid,timestamptz,uuid) to service_role;

