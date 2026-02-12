-- Drop conflicting function so 00400 can recreate it with the intended return type
begin;

drop function if exists public.admin_upsert_tracker_assignment_v2(uuid, uuid, uuid, uuid, date, date, boolean);

commit;
