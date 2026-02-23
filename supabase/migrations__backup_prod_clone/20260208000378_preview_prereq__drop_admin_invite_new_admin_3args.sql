-- Drop conflicting overload so 00400 can recreate it with intended signature
begin;

drop function if exists public.admin_invite_new_admin(text, text, text);

commit;
