-- Drop conflicting function so 00400 can recreate it with the intended RETURNS TABLE(...) shape
begin;

drop function if exists public.api_register_event(uuid, double precision, double precision, timestamp with time zone);

commit;
