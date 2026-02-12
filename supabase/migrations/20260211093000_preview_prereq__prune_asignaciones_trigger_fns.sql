begin;

-- 1) Drop de triggers en tablas relacionadas que apunten a funciones public.asignaciones_*
do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      t.tgname  as trigger_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
    where not t.tgisinternal
      and n.nspname = 'public'
      and pn.nspname = 'public'
      and p.proname like 'asignaciones\_%' escape '\'
  loop
    execute format('drop trigger if exists %I on %I.%I;',
      r.trigger_name, r.schema_name, r.table_name
    );
  end loop;
end $$;

-- 2) Drop de TODAS las sobrecargas (firmas) de funciones public.asignaciones_*
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
      and p.proname like 'asignaciones\_%' escape '\'
  loop
    execute format('drop function if exists %I.%I(%s) cascade;',
      r.schema_name, r.function_name, r.args
    );
  end loop;
end $$;

commit;
