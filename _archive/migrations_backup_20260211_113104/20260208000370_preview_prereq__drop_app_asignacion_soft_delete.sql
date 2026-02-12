-- Drop conflicting function so 00400 can recreate it with the intended return type
begin;

drop function if exists public.app_asignacion_soft_delete(uuid);

commit;
