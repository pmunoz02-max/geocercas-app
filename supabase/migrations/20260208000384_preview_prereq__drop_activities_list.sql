-- Drop conflicting function so 00400 can recreate it with the intended RETURNS TABLE(...) signature
begin;

drop function if exists public.activities_list(boolean);

commit;
