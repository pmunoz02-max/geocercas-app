begin;
do $$
declare o uuid; u uuid; g uuid; v uuid:=gen_random_uuid(); payload jsonb; r jsonb; n integer;
begin
 select m.org_id,m.user_id,f.id into o,u,g from public.memberships m join public.organizations org on org.id=m.org_id join public.geofences f on f.org_id=m.org_id
 where m.role::text in ('owner','admin') and m.revoked_at is null and org.active and not org.suspended and f.active limit 1;
 if o is null then raise exception 'No suitable Preview fixture'; end if;
 payload:=jsonb_build_object('id',v,'geofence_id',g,'started_at',now(),'document',jsonb_build_object('purpose','ROLLBACK visit test'));
 perform public.save_field_visit(o,u,'configure','{"enabled":false}'::jsonb);
 r:=public.save_field_visit(o,u,'save',payload);if r->>'error'<>'module_disabled' then raise exception 'disabled guard: %',r;end if;
 perform public.save_field_visit(o,u,'configure','{"enabled":true}'::jsonb);
 r:=public.save_field_visit(o,u,'save',payload);if r->>'ok'<>'true' then raise exception 'create: %',r;end if;
 perform public.save_field_visit(o,u,'save',payload);
 select count(*) into n from public.field_visits where id=v;if n<>1 then raise exception 'duplicate';end if;
 r:=public.save_field_visit(o,gen_random_uuid(),'save',payload);if r->>'error'<>'forbidden' then raise exception 'membership guard';end if;
 perform public.save_field_visit(o,u,'configure','{"enabled":false}'::jsonb);
 payload:=payload||jsonb_build_object('ended_at',now());
 r:=public.save_field_visit(o,u,'save',payload);if r->>'ok'<>'true' then raise exception 'finish after disable: %',r;end if;
 perform public.save_field_visit(o,u,'save',payload);
 r:=public.save_field_visit(o,u,'save',payload||jsonb_build_object('document','{"purpose":"changed"}'::jsonb));if r->>'error'<>'visit_closed' then raise exception 'closed guard: %',r;end if;
 if has_table_privilege('anon','public.field_visits','SELECT') or has_table_privilege('authenticated','public.field_visits','SELECT') then raise exception 'client table access';end if;
 if has_function_privilege('authenticated','public.save_field_visit(uuid,uuid,text,jsonb)','EXECUTE') then raise exception 'client rpc access';end if;
end $$;
rollback;
