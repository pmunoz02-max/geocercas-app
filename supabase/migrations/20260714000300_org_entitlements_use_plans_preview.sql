begin;

create or replace view public.org_entitlements as
select
  b.org_id,
  b.plan_code,
  p.geofence_limit as max_geocercas,
  coalesce(
    b.tracker_limit_override,
    p.tracker_limit
  ) as max_trackers
from public.org_billing b
join public.plans p
  on p.code::text = b.plan_code;

do $$
declare
  v_invalid_count integer;
begin
  select count(*)
  into v_invalid_count
  from public.org_billing b
  left join public.org_entitlements oe
    on oe.org_id = b.org_id
  where oe.org_id is null;

  if v_invalid_count <> 0 then
    raise exception
      'org_entitlements validation failed: % org_billing rows have no matching plan',
      v_invalid_count;
  end if;
end
$$;

commit;