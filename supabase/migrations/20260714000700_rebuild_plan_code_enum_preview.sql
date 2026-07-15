begin;

do $$
begin
  if exists (
    select 1
    from public.organizations
    where plan::text not in ('free', 'pro', 'enterprise')
  ) then
    raise exception 'Unexpected plan_code value found in public.organizations.plan';
  end if;

  if exists (
    select 1
    from public.plans
    where code::text not in ('free', 'pro', 'enterprise')
  ) then
    raise exception 'Unexpected plan_code value found in public.plans.code';
  end if;

  if exists (
    select 1
    from public.play_products
    where plan_code::text not in ('free', 'pro', 'enterprise')
  ) then
    raise exception 'Unexpected plan_code value found in public.play_products.plan_code';
  end if;
end
$$;

drop function if exists public.apply_org_plan_from_play(uuid, uuid);
drop function if exists public.get_best_plan_from_play(uuid);

alter table public.organizations
  alter column plan drop default;

create type public.plan_code_new as enum (
  'free',
  'pro',
  'enterprise'
);

alter table public.organizations
  alter column plan type public.plan_code_new
  using plan::text::public.plan_code_new;

alter table public.plans
  alter column code type public.plan_code_new
  using code::text::public.plan_code_new;

alter table public.play_products
  alter column plan_code type public.plan_code_new
  using plan_code::text::public.plan_code_new;

drop type public.plan_code;

alter type public.plan_code_new
  rename to plan_code;

alter table public.organizations
  alter column plan set default 'free'::public.plan_code;

create or replace function public.get_best_plan_from_play(org_id_in uuid)
returns public.plan_code
language sql
stable
set search_path to 'public'
as $function$
  with active_purchases as (
    select pp.*
    from public.play_purchases pp
    where pp.org_id = org_id_in
      and pp.status = 'active'
      and (
        pp.expiry_time is null
        or pp.expiry_time > now()
      )
  ),
  mapped as (
    select
      ap.id,
      pr.plan_code
    from active_purchases ap
    join public.play_products pr
      on pr.product_id = ap.product_id
     and pr.active = true
    join public.plans p
      on p.code = pr.plan_code
  ),
  ranked as (
    select
      plan_code,
      case plan_code
        when 'free' then 0
        when 'pro' then 20
        when 'enterprise' then 30
        else -1
      end as rank
    from mapped
  )
  select plan_code
  from ranked
  where rank >= 0
  order by rank desc
  limit 1;
$function$;

alter function public.get_best_plan_from_play(uuid) owner to postgres;

revoke all on function public.get_best_plan_from_play(uuid) from public, anon, authenticated;
grant execute on function public.get_best_plan_from_play(uuid) to service_role;

create or replace function public.apply_org_plan_from_play(
  org_id_in uuid,
  verified_by uuid default null::uuid
)
returns public.plan_code
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  best_plan public.plan_code;
begin
  best_plan := public.get_best_plan_from_play(org_id_in);

  if best_plan is null then
    best_plan := 'free'::public.plan_code;
  end if;

  insert into public.org_billing (
    org_id,
    plan_code,
    updated_at
  )
  values (
    org_id_in,
    best_plan,
    now()
  )
  on conflict (org_id)
  do update
    set plan_code = excluded.plan_code,
        updated_at = now();

  return best_plan;
end;
$function$;

alter function public.apply_org_plan_from_play(uuid, uuid) owner to postgres;

revoke all on function public.apply_org_plan_from_play(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_org_plan_from_play(uuid, uuid) to service_role;

do $$
declare
  v_labels text[];
begin
  select array_agg(e.enumlabel order by e.enumsortorder)
  into v_labels
  from pg_enum e
  join pg_type t
    on t.oid = e.enumtypid
  join pg_namespace n
    on n.oid = t.typnamespace
  where n.nspname = 'public'
    and t.typname = 'plan_code';

  if v_labels is distinct from array['free', 'pro', 'enterprise']::text[] then
    raise exception 'Unexpected public.plan_code values: %', v_labels;
  end if;
end
$$;

commit;
