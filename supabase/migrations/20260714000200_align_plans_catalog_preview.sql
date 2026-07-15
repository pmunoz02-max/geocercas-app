begin;

insert into public.plans (
  code,
  name,
  geofence_limit,
  tracker_limit,
  price_month_usd
)
values
  ('free', 'FREE', 1, 2, 0),
  ('pro', 'PRO', 25, 10, 29),
  ('enterprise', 'Enterprise', 250, 50, 99)
on conflict (code) do update
set
  name = excluded.name,
  geofence_limit = excluded.geofence_limit,
  tracker_limit = excluded.tracker_limit,
  price_month_usd = excluded.price_month_usd;

do $$
declare
  v_count integer;
begin
  select count(*)
  into v_count
  from public.plans
  where
    (code = 'free' and geofence_limit = 1 and tracker_limit = 2 and price_month_usd = 0)
    or (code = 'pro' and geofence_limit = 25 and tracker_limit = 10 and price_month_usd = 29)
    or (code = 'enterprise' and geofence_limit = 250 and tracker_limit = 50 and price_month_usd = 99);

  if v_count <> 3 then
    raise exception
      'Plans catalog validation failed: expected 3 configured plans, found %',
      v_count;
  end if;
end
$$;

commit;