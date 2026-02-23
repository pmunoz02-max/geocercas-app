-- Drop conflicting trigger function so 00400 can recreate it
begin;

drop function if exists public.apply_pending_invite_on_profile();

commit;
