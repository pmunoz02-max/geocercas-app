-- Drop conflicting trigger function so 00400 can recreate it
begin;

drop function if exists public.asignaciones_auto_estado();

commit;
