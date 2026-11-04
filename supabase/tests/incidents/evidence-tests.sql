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
declare org uuid:=gen_random_uuid(); who uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); fence uuid:=gen_random_uuid(); iid uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); evidence uuid:=gen_random_uuid(); obs uuid; r jsonb; meta jsonb; first jsonb;
begin
 insert into auth.users values(who),(other_user);
 insert into public.organizations(id) values(org);
 insert into public.memberships values(org,who,'owner',null),(org,other_user,'tracker',null);
 insert into public.geofences values(fence,org,'Photo plot',true);
 perform public.save_incident_core(org,who,gen_random_uuid(),'configure','{"enabled":true}');
 r:=public.save_incident_core(org,who,op,'create',jsonb_build_object('id',iid,'geofence_id',fence,'title','Photos','category','other','severity','low','lat',1,'lng',2,'accuracy_m',5,'location_source','gps','observed_at',now(),'captured_at',now()));
 obs:=(r->>'observation_id')::uuid;
 if obs is null then raise exception 'Missing observation id'; end if;
 meta:=jsonb_build_object('sha256',repeat('a',64),'mime_type','image/png','byte_size',100,'attached_at',now(),'location',null);
 first:=public.reserve_incident_evidence(org,who,iid,obs,evidence,meta);
 if first<>public.reserve_incident_evidence(org,who,iid,obs,evidence,meta) then raise exception 'Replay differs'; end if;
 perform pg_temp.expect_error(format('select public.reserve_incident_evidence(%L,%L,%L,%L,%L,%L)',org,who,iid,obs,evidence,meta||'{"byte_size":101}'),'operation_conflict');
 perform pg_temp.expect_error(format('select public.reserve_incident_evidence(%L,%L,%L,%L,%L,%L)',org,other_user,iid,obs,evidence,meta),'forbidden');
 perform pg_temp.expect_error(format('select public.reserve_incident_evidence(%L,%L,%L,%L,%L,%L)',org,who,iid,gen_random_uuid(),gen_random_uuid(),meta),'forbidden');
 perform pg_temp.expect_error(format('select public.finish_incident_evidence(%L,%L,%L)',org,other_user,evidence),'forbidden');
 perform public.finish_incident_evidence(org,who,evidence);
 perform public.finish_incident_evidence(org,who,evidence);
 for n in 2..5 loop perform public.reserve_incident_evidence(org,who,iid,obs,gen_random_uuid(),meta); end loop;
 perform pg_temp.expect_error(format('select public.reserve_incident_evidence(%L,%L,%L,%L,%L,%L)',org,who,iid,obs,gen_random_uuid(),meta),'photo_limit');
 if jsonb_array_length(public.read_incident_core(org,who,iid)->'evidence')<>5 then raise exception 'Evidence count'; end if;
 if (select count(*) from public.incident_evidence where uploaded)<>1 then raise exception 'Upload visibility'; end if;
 update public.memberships set revoked_at=now() where org_id=org and user_id=who;
 perform pg_temp.expect_error(format('select public.reserve_incident_evidence(%L,%L,%L,%L,%L,%L)',org,who,iid,obs,evidence,meta),'forbidden');
 if has_function_privilege('authenticated','public.reserve_incident_evidence(uuid,uuid,uuid,uuid,uuid,jsonb)','execute') then raise exception 'Public grant'; end if;
 raise notice 'PASS: evidence reservation, replays, immutable metadata, photo limit, ownership, finalization, revocation and grants';
end $test$;
rollback;
