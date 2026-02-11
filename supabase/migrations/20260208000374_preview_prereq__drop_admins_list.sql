-- Drop conflicting function so 00400 can recreate it with the intended RETURNS TABLE(...) shape
begin;

drop function if exists public.admins_list(uuid);

commit;
