-- Drop conflicting function so 00400 can recreate it with the intended return type
begin;

drop function if exists public.admin_delete_person(uuid);

commit;
