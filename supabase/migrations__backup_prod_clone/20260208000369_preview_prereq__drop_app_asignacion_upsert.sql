-- Drop conflicting function so 00400 can recreate it with the intended return type
begin;

drop function if exists public.app_asignacion_upsert(uuid, uuid, uuid, uuid, uuid, date, date, text, integer);

commit;
