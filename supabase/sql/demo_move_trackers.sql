create or replace function public.demo_move_trackers()
returns void
language plpgsql
as $$
declare
  v_now timestamptz := now();
begin

  insert into tracker_positions (
    org_id,
    user_id,
    personal_id,
    lat,
    lng,
    accuracy,
    speed,
    heading,
    battery,
    is_mock,
    source,
    recorded_at
  )
  select
    org_id,
    user_id,
    personal_id,
    lat + ((random()-0.5) * 0.00005),
    lng + ((random()-0.5) * 0.00005),
    accuracy,
    speed,
    heading,
    battery,
    true,
    'demo-live',
    v_now
  from tracker_positions
  where source = 'demo-seed'
  order by recorded_at desc
  limit 3;

end;
$$;