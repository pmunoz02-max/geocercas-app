begin;

do $$
declare
  v_dependency_count integer;
begin
  select count(*)
  into v_dependency_count
  from pg_depend d
  join pg_class dependent_object
    on dependent_object.oid = d.objid
  join pg_namespace dependent_ns
    on dependent_ns.oid = dependent_object.relnamespace
  join pg_class source_table
    on source_table.oid = d.refobjid
  join pg_namespace source_ns
    on source_ns.oid = source_table.relnamespace
  where source_ns.nspname = 'public'
    and source_table.relname = 'plan_limits'
    and not (
      dependent_ns.nspname = 'public'
      and dependent_object.relname = 'ux_plan_limits_plan'
    )
    and dependent_ns.nspname <> 'pg_toast';

  if v_dependency_count <> 0 then
    raise exception
      'Cannot drop public.plan_limits: % unexpected dependencies remain',
      v_dependency_count;
  end if;
end
$$;

drop table public.plan_limits;

do $$
begin
  if to_regclass('public.plan_limits') is not null then
    raise exception 'public.plan_limits still exists after drop';
  end if;
end
$$;

commit;