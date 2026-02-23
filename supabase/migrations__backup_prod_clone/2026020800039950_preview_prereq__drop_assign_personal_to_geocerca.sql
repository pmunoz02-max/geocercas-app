begin;

-- Drop de cualquier función public.assign_personal_to_geocerca(*) con cualquier firma/retorno
do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'assign_personal_to_geocerca'
  loop
    execute format('drop function if exists %I.%I(%s) cascade;',
      r.schema_name, r.function_name, r.args
    );
  end loop;
end $$;

commit;
