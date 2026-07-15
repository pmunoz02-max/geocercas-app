begin;

update public.plan_limits
set
  max_geocercas = case plan
    when 'free' then 1
    when 'pro' then 25
    when 'enterprise' then 250
    else max_geocercas
  end,
  max_trackers = case plan
    when 'free' then 2
    when 'pro' then 10
    when 'enterprise' then 50
    else max_trackers
  end
where plan in ('free', 'pro', 'enterprise');

do $$
declare
  v_count integer;
begin
  select count(*)
  into v_count
  from public.plan_limits
  where
    (plan = 'free' and max_geocercas = 1 and max_trackers = 2)
    or (plan = 'pro' and max_geocercas = 25 and max_trackers = 10)
    or (plan = 'enterprise' and max_geocercas = 250 and max_trackers = 50);

  if v_count <> 3 then
    raise exception
      'Plan limits validation failed: expected 3 configured plans, found %',
      v_count;
  end if;
end
$$;

commit;