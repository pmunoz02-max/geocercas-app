create schema if not exists public;

-- Utilidad: verifica si una columna existe en una tabla.
-- Robusto y rápido: usa catálogo pg_attribute.
create or replace function public._col_exists(p_table regclass, p_col text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from pg_attribute a
    where a.attrelid = p_table
      and a.attname  = p_col
      and a.attnum > 0
      and not a.attisdropped
  );
$$;

-- (Opcional) Si tu 00400 hace GRANT, esto no estorba; si no lo hace, lo dejamos ya puesto:
grant execute on function public._col_exists(regclass, text) to anon, authenticated, service_role;
