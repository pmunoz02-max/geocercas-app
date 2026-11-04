\set ON_ERROR_STOP on
begin;
create function pg_temp.expect_error(q text,expected text) returns void language plpgsql as $$
begin
 begin execute q; exception when others then
  if sqlerrm like '%'||expected||'%' then return; end if;
  raise exception 'Wrong error, expected %, actual %',expected,sqlerrm;
 end;
 raise exception 'Expected rejection: %',expected;
end $$;
do $test$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); owner_a uuid:=gen_random_uuid(); tech uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid();
 ga uuid:=gen_random_uuid(); gb uuid:=gen_random_uuid(); vb uuid:=gen_random_uuid(); iid uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); body jsonb; r jsonb; r2 jsonb; counts int;
begin
 insert into auth.users values(owner_a),(tech),(owner_b);
 insert into public.organizations(id) values(a),(b);
 insert into public.memberships values(a,owner_a,'owner',null),(a,tech,'tracker',null),(b,owner_b,'owner',null);
 insert into public.geofences values(ga,a,'Parcela A',true),(gb,b,'Parcela B',true);
 insert into public.field_visits values(vb,b,owner_b,gb);
 body:=jsonb_build_object('id',iid,'geofence_id',ga,'title','Incidencia de prueba','category','pest','severity','low','lat',-0.2,'lng',-78.5,'accuracy_m',20,'location_source','gps','captured_at',now(),'observed_at',now(),'note','Observación inicial');
 perform pg_temp.expect_error(format('select public.save_incident_core(%L,%L,%L,%L,%L)',a,owner_a,op,'create',body),'module_disabled');
 perform pg_temp.expect_error(format('select public.save_incident_core(%L,%L,%L,%L,%L)',a,tech,op,'configure','{"enabled":true}'),'forbidden');
 perform public.save_incident_core(a,owner_a,gen_random_uuid(),'configure','{"enabled":true}');
 perform pg_temp.expect_error(format('select public.save_incident_core(%L,%L,%L,%L,%L)',a,owner_b,op,'create',body),'forbidden');
 perform pg_temp.expect_error(format('select public.save_incident_core(%L,%L,%L,%L,%L)',a,owner_a,op,'create',body||jsonb_build_object('geofence_id',gb)),'invalid_geofence');
 perform pg_temp.expect_error(format('select public.save_incident_core(%L,%L,%L,%L,%L)',a,owner_a,op,'create',body||jsonb_build_object('visit_id',vb)),'invalid_visit');
 perform pg_temp.expect_error(format('select public.save_incident_core(%L,%L,%L,%L,%L)',a,tech,op,'create',body),'assignment_required');
 perform pg_temp.expect_error(format('select public.save_incident_core(%L,%L,%L,%L,%L)',a,owner_a,op,'create',body||'{"lat":91}'::jsonb),'check constraint');
 perform pg_temp.expect_error(format('select public.save_incident_core(%L,%L,%L,%L,%L)',a,owner_a,op,'create',body||'{"photos":[]}'::jsonb),'unsupported_fields');
 r:=public.save_incident_core(a,owner_a,op,'create',body);
 r2:=public.save_incident_core(a,owner_a,op,'create',body);
 if r<>r2 or (select count(*) from public.incidents)<>1 or (select count(*) from public.incident_observations)<>1 then raise exception 'Duplicate write'; end if;
 perform pg_temp.expect_error(format('select public.save_incident_core(%L,%L,%L,%L,%L)',a,owner_a,op,'create',body||'{"title":"Changed"}'::jsonb),'operation_conflict');
 if jsonb_array_length(public.read_incident_core(a,tech)->'items')<>0 then raise exception 'Tracker saw foreign incident'; end if;
 perform pg_temp.expect_error(format('select public.read_incident_core(%L,%L,%L)',a,tech,iid),'forbidden');
 perform pg_temp.expect_error(format('select public.read_incident_core(%L,%L,%L)',b,owner_b,iid),'forbidden');
 perform pg_temp.expect_error(format('update public.incidents set geofence_id=%L where id=%L',gb,iid),'incidents_geofence_same_org');
 perform pg_temp.expect_error(format('update public.geofences set org_id=%L where id=%L',b,ga),'incidents_geofence_same_org');
 perform pg_temp.expect_error(format('delete from public.geofences where id=%L',ga),'foreign key');
 update public.geofences set active=false where id=ga;
 if (public.read_incident_core(a,owner_a,iid)->'incident'->>'geofence_name_snapshot')<>'Parcela A' then raise exception 'Lost history'; end if;
 r:=public.save_incident_core(a,owner_a,gen_random_uuid(),'transition',jsonb_build_object('id',iid,'expected_version',1,'status','treating','reason','Seguimiento'));
 if (r->>'version')::int<>2 then raise exception 'Wrong version'; end if;
 perform pg_temp.expect_error(format('select public.save_incident_core(%L,%L,%L,%L,%L)',a,owner_a,gen_random_uuid(),'observe',jsonb_build_object('id',iid,'expected_version',1,'note','Vieja','observed_at',now())),'version_conflict');
 perform public.save_incident_core(a,owner_a,gen_random_uuid(),'transition',jsonb_build_object('id',iid,'expected_version',2,'status','closed','reason','Finalizada'));
 perform pg_temp.expect_error(format('select public.save_incident_core(%L,%L,%L,%L,%L)',a,owner_a,gen_random_uuid(),'observe',jsonb_build_object('id',iid,'expected_version',3,'note','Nueva','observed_at',now())),'incident_closed');
 perform public.save_incident_core(a,owner_a,gen_random_uuid(),'transition',jsonb_build_object('id',iid,'expected_version',3,'status','detected','reason','Reabierta'));
 update public.memberships set revoked_at=now() where org_id=a and user_id=owner_a;
 perform pg_temp.expect_error(format('select public.save_incident_core(%L,%L,%L,%L,%L)',a,owner_a,op,'create',body),'forbidden');
 if has_function_privilege('anon','public.save_incident_core(uuid,uuid,uuid,text,jsonb)','execute') or has_function_privilege('authenticated','public.save_incident_core(uuid,uuid,uuid,text,jsonb)','execute') then raise exception 'Public RPC'; end if;
 if not has_function_privilege('service_role','public.save_incident_core(uuid,uuid,uuid,text,jsonb)','execute') then raise exception 'Missing backend RPC grant'; end if;
 if has_table_privilege('service_role','public.incidents','insert') or has_table_privilege('authenticated','public.incidents','select') then raise exception 'Direct table access'; end if;
 raise notice 'PASS: core access, creation, duplicate replay, payload conflict, cross-org links, history, transitions, stale version and revoked actor';
end $test$;
rollback;
select count(*) as fixtures_remaining from public.incidents;
