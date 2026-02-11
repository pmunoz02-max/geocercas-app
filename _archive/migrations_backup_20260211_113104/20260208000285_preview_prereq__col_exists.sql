create schema if not exists public;

-- prereq: used by 00300 grants and later by vft helpers
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

create or replace function public._col_exists(p_table text, p_col text)
returns boolean
language plpgsql
stable
as $$
declare
  v_reg regclass;
begin
  begin
    v_reg := p_table::regclass;
  exception when others then
    return false;
  end;

  return public._col_exists(v_reg, p_col);
end;
$$;
