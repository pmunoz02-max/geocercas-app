-- Fix type mismatch for 00400: expose org_memberships.role as text (cast from enum role_type)
-- Need DROP VIEW first because OR REPLACE cannot change column types.

begin;

drop view if exists public.org_memberships;

create view public.org_memberships as
select
  m.org_id,
  m.user_id,
  (m.role::text) as role
from public.memberships m
where m.revoked_at is null;

commit;
