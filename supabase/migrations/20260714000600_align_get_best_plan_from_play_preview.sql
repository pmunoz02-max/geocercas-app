begin;

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

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_best_plan_from_play'
    and pg_get_function_identity_arguments(p.oid) = 'org_id_in uuid';

  if v_definition is null then
    raise exception 'get_best_plan_from_play(uuid) was not created';
  end if;

  if v_definition ilike '%starter%'
     or v_definition ilike '%elite%'
     or v_definition ilike '%elite_plus%' then
    raise exception
      'Legacy plan codes remain in get_best_plan_from_play';
  end if;
end
$$;

commit;
