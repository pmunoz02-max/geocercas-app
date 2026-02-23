-- Ensure public.asignaciones has user_id column expected by 00400 (app_asignacion_upsert)
-- Plus a safe backfill from personal_id -> personal.user_id when possible.

begin;

do $$
begin
  -- 1) Add column if missing
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'asignaciones'
      and column_name  = 'user_id'
  ) then
    alter table public.asignaciones
      add column user_id uuid;
  end if;
end
$$;

-- 2) Backfill (safe): if personal_id exists and personal.user_id exists, set user_id
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='personal' and column_name='user_id'
  ) then
    update public.asignaciones a
    set user_id = p.user_id
    from public.personal p
    where a.user_id is null
      and a.personal_id is not null
      and p.id = a.personal_id
      and p.user_id is not null;
  end if;
end
$$;

commit;
