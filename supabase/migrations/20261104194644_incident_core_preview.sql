-- Incident core, Preview-first. Module stays disabled. No photo writes in this phase.
-- Composite references also prevent moving referenced geofences/visits across orgs.
alter table public.geofences add constraint geofences_incident_org_id_unique unique(org_id,id);
alter table public.field_visits add constraint visits_incident_org_id_unique unique(org_id,id);
create table public.org_incident_settings (
 org_id uuid primary key references public.organizations(id) on delete restrict,
 enabled boolean not null default false,
 updated_by uuid not null references auth.users(id) on delete restrict,
 updated_at timestamptz not null default now()
);
create table public.incidents (
 id uuid primary key,
 org_id uuid not null references public.organizations(id) on delete restrict,
 author_id uuid not null references auth.users(id) on delete restrict,
 geofence_id uuid not null references public.geofences(id) on delete restrict,
 geofence_name_snapshot text not null,
 visit_id uuid references public.field_visits(id) on delete restrict,
 title text not null check (length(trim(title)) between 1 and 120),
 category text not null check (category in ('pest','disease','anomaly','other')),
 severity text not null check (severity in ('unknown','low','medium','high')),
 status text not null default 'detected' check (status in ('detected','treating','controlled','closed')),
 lat numeric not null check (lat between -90 and 90),
 lng numeric not null check (lng between -180 and 180),
 accuracy_m numeric check (accuracy_m >= 0 and accuracy_m < 1000000),
 location_source text not null check (location_source in ('gps','manual')),
 captured_at timestamptz not null,
 observed_at timestamptz not null,
 received_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 version bigint not null default 1 check (version > 0),
 unique(org_id,id),
 check (location_source <> 'manual' or accuracy_m is null)
);
create table public.incident_observations (
 id uuid primary key,
 org_id uuid not null,
 incident_id uuid not null,
 author_id uuid not null references auth.users(id) on delete restrict,
 note text not null check (length(note) <= 4000),
 observed_at timestamptz not null,
 received_at timestamptz not null default now(),
 unique(org_id,incident_id,id),
 foreign key(org_id,incident_id) references public.incidents(org_id,id) on delete restrict
);
create table public.incident_evidence (
 id uuid primary key,
 org_id uuid not null,
 incident_id uuid not null,
 observation_id uuid not null,
 slot smallint not null check (slot between 1 and 5),
 object_path text not null unique,
 sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
 mime_type text not null check(mime_type in ('image/jpeg','image/png')),
 byte_size integer not null check(byte_size between 1 and 2097152),
 attached_at timestamptz not null,
 received_at timestamptz not null default now(),
 unique(org_id,incident_id,observation_id,slot),
 foreign key(org_id,incident_id,observation_id)
 references public.incident_observations(org_id,incident_id,id) on delete restrict
);
create table public.incident_events (
 id uuid primary key,
 org_id uuid not null,
 incident_id uuid not null,
 actor_id uuid not null references auth.users(id) on delete restrict,
 event_type text not null check(event_type in ('created','observed','status_changed','reopened')),
 from_status text,
 to_status text,
 reason text check(length(reason)<=4000),
 created_at timestamptz not null default now(),
 foreign key(org_id,incident_id) references public.incidents(org_id,id) on delete restrict
);
create table public.incident_operations (
 org_id uuid not null references public.organizations(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict,
 operation_id uuid not null,
 request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
 response jsonb not null check(jsonb_typeof(response)='object'),
 created_at timestamptz not null default now(),
 primary key(org_id,actor_id,operation_id)
);
create index incidents_org_received on public.incidents(org_id,received_at desc,id);
create index incidents_org_author on public.incidents(org_id,author_id,received_at desc,id);
create index incidents_org_status on public.incidents(org_id,status,received_at desc,id);
create index incidents_geofence on public.incidents(geofence_id);
create index incidents_visit on public.incidents(visit_id) where visit_id is not null;
create index incident_observations_timeline on public.incident_observations(org_id,incident_id,received_at,id);
create index incident_events_timeline on public.incident_events(org_id,incident_id,created_at,id);

-- Acceso cerrado hasta disponer de las funciones autorizadas y pruebas.
alter table public.org_incident_settings enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_observations enable row level security;
alter table public.incident_evidence enable row level security;
alter table public.incident_events enable row level security;
alter table public.incident_operations enable row level security;
revoke all on public.org_incident_settings,public.incidents,public.incident_observations,
 public.incident_evidence,public.incident_events,public.incident_operations
 from public,anon,authenticated,service_role;


alter table public.incidents add constraint incidents_geofence_same_org
 foreign key(org_id,geofence_id) references public.geofences(org_id,id) on update restrict on delete restrict;
alter table public.incidents add constraint incidents_visit_same_org
 foreign key(org_id,visit_id) references public.field_visits(org_id,id) on update restrict on delete restrict;

-- Internal helper: caller identity must already be validated by the trusted API.
create function public.incident_actor_role(p_org uuid,p_actor uuid) returns text
language plpgsql security definer set search_path='' as $$
declare r text;
begin
 perform 1 from public.organizations where id=p_org and active and not suspended for share;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 select role::text into r from public.memberships where org_id=p_org and user_id=p_actor and revoked_at is null for share;
 if r is null then raise exception 'forbidden' using errcode='42501'; end if;
 return r;
end $$;
revoke all on function public.incident_actor_role(uuid,uuid) from public,anon,authenticated,service_role;

create function public.save_incident_core(p_org uuid,p_actor uuid,p_operation uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; manager boolean; saved public.incidents%rowtype; prior public.incident_operations%rowtype;
 result jsonb; digest text; iid uuid; gid uuid; vid uuid; observed timestamptz; captured timestamptz;
 target text; note text; fence_name text; expected bigint; enabled_now boolean;
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
   values(gen_random_uuid(),p_org,iid,p_actor,note,observed);
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
    insert into public.incident_observations(id,org_id,incident_id,author_id,note,observed_at) values(gen_random_uuid(),p_org,iid,p_actor,note,observed);
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
  result:=jsonb_build_object('ok',true,'id',saved.id,'version',saved.version,'operation_id',p_operation,'received_at',saved.received_at,'photos_supported',false);
 end if;
 insert into public.incident_operations(org_id,actor_id,operation_id,request_hash,response) values(p_org,p_actor,p_operation,digest,result);
 return result;
end $$;
revoke all on function public.save_incident_core(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_incident_core(uuid,uuid,uuid,text,jsonb) to service_role;

create function public.read_incident_core(p_org uuid,p_actor uuid,p_id uuid default null,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; manager boolean; result jsonb;
begin
 r:=public.incident_actor_role(p_org,p_actor); manager:=r in ('owner','admin');
 if (p_before is null) <> (p_before_id is null) then raise exception 'invalid_cursor' using errcode='22023'; end if;
 if p_id is not null then
  select to_jsonb(i) into result from public.incidents i where org_id=p_org and id=p_id and (manager or author_id=p_actor);
  if result is null then raise exception 'forbidden' using errcode='42501'; end if;
  return jsonb_build_object('incident',result,'observations',coalesce((select jsonb_agg(to_jsonb(o) order by received_at,id) from public.incident_observations o where org_id=p_org and incident_id=p_id),'[]'::jsonb),
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

