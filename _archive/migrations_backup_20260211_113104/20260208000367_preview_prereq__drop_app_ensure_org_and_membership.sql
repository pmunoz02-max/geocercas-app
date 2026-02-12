-- Drop conflicting function so 00400 can recreate it with the intended return type
begin;

drop function if exists public.app_ensure_org_and_membership(uuid, text, text);

commit;
