-- GeoField GPS
-- Entorno autorizado: Supabase Preview (mujwsfhkocsuuahlrssn)
-- Produccion: sin cambios
--
-- Objetivos:
--   1. Alinear public.org_entitlements con public.plans.
--   2. Inicializar public.org_billing como FREE para toda organizacion nueva.
--   3. Completar solo organizaciones FREE sin fila de facturacion.
--
-- La migracion es idempotente y no elimina public.plan_limits.

begin;

do $$
begin
  if to_regclass('public.org_entitlements') is null then
    raise exception 'No existe public.org_entitlements';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'org_entitlements'
      and c.relkind = 'v'
  ) then
    raise exception 'public.org_entitlements existe, pero no es una vista';
  end if;

  if to_regclass('public.plans') is null then
    raise exception 'No existe el catalogo oficial public.plans';
  end if;
end
$$;

create or replace view public.org_entitlements as
select
  b.org_id,
  b.plan_code,
  p.geofence_limit as max_geocercas,
  coalesce(b.tracker_limit_override, p.tracker_limit) as max_trackers
from public.org_billing b
join public.plans p
  on p.code::text = b.plan_code;

create or replace function public.initialize_free_org_billing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.org_billing (
    org_id,
    plan_code,
    plan_status,
    subscribed_plan_code,
    billing_provider
  )
  values (
    new.id,
    'free',
    'free',
    'free',
    null
  )
  on conflict (org_id) do nothing;

  return new;
end;
$$;

revoke all on function public.initialize_free_org_billing() from public;

drop trigger if exists trg_initialize_free_org_billing
  on public.organizations;

create trigger trg_initialize_free_org_billing
after insert on public.organizations
for each row
execute function public.initialize_free_org_billing();

insert into public.org_billing (
  org_id,
  plan_code,
  plan_status,
  subscribed_plan_code,
  billing_provider
)
select
  o.id,
  'free',
  'free',
  'free',
  null
from public.organizations o
left join public.org_billing b
  on b.org_id = o.id
where b.org_id is null
  and o.plan::text = 'free'
on conflict (org_id) do nothing;

do $$
declare
  v_invalid_catalog_count integer;
  v_missing_free_billing_count integer;
  v_nonfree_without_billing_count integer;
  v_entitlements_using_plans boolean;
begin
  select count(*)
    into v_invalid_catalog_count
  from (
    values
      ('free', 1, 2),
      ('pro', 25, 10),
      ('enterprise', 250, 50)
  ) as expected(plan_code, max_geocercas, max_trackers)
  where not exists (
    select 1
    from public.plans p
    where p.code::text = expected.plan_code
      and p.geofence_limit = expected.max_geocercas
      and p.tracker_limit = expected.max_trackers
  );

  if v_invalid_catalog_count <> 0 then
    raise exception 'public.plans no coincide con los limites oficiales';
  end if;

  select count(*)
    into v_missing_free_billing_count
  from public.organizations o
  left join public.org_billing b on b.org_id = o.id
  where o.plan::text = 'free'
    and b.org_id is null;

  if v_missing_free_billing_count <> 0 then
    raise exception
      'Persisten % organizaciones FREE sin org_billing',
      v_missing_free_billing_count;
  end if;

  select count(*)
    into v_nonfree_without_billing_count
  from public.organizations o
  left join public.org_billing b on b.org_id = o.id
  where o.plan::text <> 'free'
    and b.org_id is null;

  if v_nonfree_without_billing_count <> 0 then
    raise exception
      'Existen % organizaciones no FREE sin org_billing; requieren auditoria manual',
      v_nonfree_without_billing_count;
  end if;

  select pg_get_viewdef('public.org_entitlements'::regclass, true)
    ~ '(^|[^a-zA-Z0-9_])((public\.)?plans)([^a-zA-Z0-9_]|$)'
    into v_entitlements_using_plans;

  if not v_entitlements_using_plans then
    raise exception 'public.org_entitlements no quedo alineada con public.plans';
  end if;
end
$$;

commit;
