-- Migration: Create tracker_geofence_events table and helper functions for DEMO geofence tracking
-- Preview-only feature: no production impact

-- Table to store geofence entry/exit events
create table if not exists public.tracker_geofence_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  personal_id uuid null,
  geocerca_id uuid not null references public.geofences(id) on delete cascade,
  geocerca_nombre text not null,
  event_type text not null check (event_type in ('ENTER','EXIT')),
  lat double precision null,
  lng double precision null,
  source text not null default 'demo-geofence',
  created_at timestamptz not null default now()
);

-- Indexes for fast lookups
create index idx_tracker_geofence_events_org_id on public.tracker_geofence_events(org_id);
create index idx_tracker_geofence_events_user_id on public.tracker_geofence_events(user_id);
create index idx_tracker_geofence_events_geocerca_id on public.tracker_geofence_events(geocerca_id);
create index idx_tracker_geofence_events_created_at on public.tracker_geofence_events(created_at desc);
create index idx_tracker_geofence_events_user_geocerca_type on public.tracker_geofence_events(user_id, geocerca_id, event_type);

-- Enable RLS
alter table public.tracker_geofence_events enable row level security;

-- RLS policy: users can view events from their org
create policy "tracker_geofence_events_view_own_org"
  on public.tracker_geofence_events
  for select
  using (
    exists (
      select 1 from public.organizations o
      join public.memberships m on m.org_id = o.id
      where o.id = tracker_geofence_events.org_id
        and m.user_id = auth.uid()
        and m.revoked_at is null
    )
  );

-- Grant privileges
grant select on public.tracker_geofence_events to authenticated;

-- Helper function to check if a point is inside a bounding box
-- bbox format: {"minLng": -78.5, "maxLng": -78.4, "minLat": -0.1, "maxLat": 0.0}
create or replace function public.is_point_in_bbox(
  p_bbox jsonb,
  p_lat double precision,
  p_lng double precision
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_min_lng double precision;
  v_max_lng double precision;
  v_min_lat double precision;
  v_max_lat double precision;
begin
  if p_bbox is null or p_lat is null or p_lng is null then
    return false;
  end if;

  v_min_lng := (p_bbox->>'minLng')::double precision;
  v_max_lng := (p_bbox->>'maxLng')::double precision;
  v_min_lat := (p_bbox->>'minLat')::double precision;
  v_max_lat := (p_bbox->>'maxLat')::double precision;

  if v_min_lng is null or v_max_lng is null or v_min_lat is null or v_max_lat is null then
    return false;
  end if;

  return p_lng >= v_min_lng and p_lng <= v_max_lng
     and p_lat >= v_min_lat and p_lat <= v_max_lat;
end;
$$;

grant execute on function public.is_point_in_bbox to authenticated;

notify pgrst, 'reload schema';
