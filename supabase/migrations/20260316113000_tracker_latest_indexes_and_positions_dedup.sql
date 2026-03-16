-- tracker_latest: useful index for reads by organization
CREATE INDEX IF NOT EXISTS idx_tracker_latest_org_ts
ON public.tracker_latest (org_id, ts DESC);

-- tracker_latest: optional lookup by tenant + user
CREATE INDEX IF NOT EXISTS idx_tracker_latest_org_user
ON public.tracker_latest (org_id, user_id);

-- positions: drop duplicate org/time index
DROP INDEX IF EXISTS public.idx_positions_org_time;

-- positions: drop duplicate user/time index
DROP INDEX IF EXISTS public.idx_positions_user_time;
