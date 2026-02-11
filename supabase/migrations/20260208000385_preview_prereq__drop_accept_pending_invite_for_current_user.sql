-- Drop conflicting function so 00400 can recreate it with the intended return type
begin;

drop function if exists public.accept_pending_invite_for_current_user();

commit;
