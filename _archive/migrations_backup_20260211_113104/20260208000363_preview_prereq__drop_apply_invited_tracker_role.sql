-- Drop conflicting trigger function so 00400 can recreate it
begin;

drop function if exists public.apply_invited_tracker_role();

commit;
