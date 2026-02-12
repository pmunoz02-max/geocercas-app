-- Drop conflicting trigger function so 00400 can recreate it
begin;

drop function if exists public.asignaciones_check_tenant();

commit;
