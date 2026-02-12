-- Drop conflicting function so 00400 can recreate it with the intended return type
begin;

drop function if exists public.app_personal_soft_delete(uuid);

commit;
