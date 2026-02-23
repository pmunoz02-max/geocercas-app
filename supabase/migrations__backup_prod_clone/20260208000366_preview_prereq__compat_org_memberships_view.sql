-- Compatibility layer for migration 00400:
-- Provide public.org_memberships as a VIEW over public.memberships if the table does not exist.

begin;

do $$
begin
  -- If org_memberships table exists, do nothing.
  if to_regclass('public.org_memberships') is not null then
    -- Could be a table or view already
    return;
  end if;

  -- If memberships doesn't exist, fail early with a clear error
  if to_regclass('public.memberships') is null then
    raise exception 'compat_org_memberships_view: public.memberships does not exist';
  end if;

  -- Create a compatibility view with the columns that 00400 expects: (org_id, user_id, role)
  execute $v$
    create view public.org_memberships as
    select
      m.org_id,
      m.user_id,
      m.role
    from public.memberships m
    where m.revoked_at is null
  $v$;
end
$$;

commit;
