-- EXCLUSIVAMENTE PREVIEW
-- Restaura las RPC funcionales de organizaciones e invitaciones.
--
-- Arquitectura:
--   public.org_members = fuente canónica de membresía y autorización.
--   public.app_user_roles = proyección derivada.
--   public.memberships = compatibilidad transitoria.
--
-- No ejecutar en Producción.
-- No aplicar mediante supabase db push.

begin;

create or replace function public.create_organization(
  p_name text,
  p_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_name text := btrim(p_name);
  v_slug text := nullif(btrim(p_slug), '');
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '28000';
  end if;

  if v_name is null or v_name = '' then
    raise exception 'Organization name is required'
      using errcode = '22023';
  end if;

  insert into public.organizations (
    name,
    slug,
    owner_id
  )
  values (
    v_name,
    v_slug,
    v_user_id
  )
  returning id into v_org_id;

  insert into public.org_members (
    org_id,
    user_id,
    role,
    is_active
  )
  values (
    v_org_id,
    v_user_id,
    'owner'::public.role_type,
    true
  )
  on conflict (org_id, user_id)
  do update
    set role = excluded.role,
        is_active = true;

  return v_org_id;
end;
$function$;

alter function public.create_organization(text, text)
  owner to postgres;

comment on function public.create_organization(text, text) is
  'Creates an organization for the authenticated user and records the owner in canonical public.org_members. Preview architecture 2026-07-27.';


create or replace function public.create_organization_for_current_user(
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_name text := btrim(p_name);
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '28000';
  end if;

  if v_name is null or v_name = '' then
    raise exception 'Organization name is required'
      using errcode = '22023';
  end if;

  insert into public.organizations (
    name,
    owner_id
  )
  values (
    v_name,
    v_user_id
  )
  returning id into v_org_id;

  insert into public.org_members (
    org_id,
    user_id,
    role,
    is_active
  )
  values (
    v_org_id,
    v_user_id,
    'owner'::public.role_type,
    true
  )
  on conflict (org_id, user_id)
  do update
    set role = excluded.role,
        is_active = true;

  return v_org_id;
end;
$function$;

alter function public.create_organization_for_current_user(text)
  owner to postgres;

comment on function
  public.create_organization_for_current_user(text) is
  'Creates an organization for auth.uid() and records the owner in canonical public.org_members. Preview architecture 2026-07-27.';


create or replace function public.cancel_invitation(
  p_invite_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_cancelled boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '28000';
  end if;

  if p_invite_id is null then
    raise exception 'Invitation id is required'
      using errcode = '22023';
  end if;

  select i.org_id
    into v_org_id
  from public.invitations i
  where i.id = p_invite_id;

  if v_org_id is null then
    raise exception 'Invitation not found'
      using errcode = 'P0002';
  end if;

  if not public.is_org_admin(v_org_id, v_user_id) then
    raise exception 'Only an active owner or admin can cancel invitations'
      using errcode = '42501';
  end if;

  update public.invitations
     set status = 'cancelled'::public.invite_status
   where id = p_invite_id
     and status = 'pending'::public.invite_status;

  v_cancelled := found;

  return v_cancelled;
end;
$function$;

alter function public.cancel_invitation(uuid)
  owner to postgres;

comment on function public.cancel_invitation(uuid) is
  'Cancels a pending invitation after canonical authorization through public.org_members. Returns true only when a pending invitation was cancelled.';


revoke all on function public.create_organization(text, text)
  from public, anon;

revoke all on function
  public.create_organization_for_current_user(text)
  from public, anon;

revoke all on function public.cancel_invitation(uuid)
  from public, anon;


grant execute on function public.create_organization(text, text)
  to authenticated, service_role;

grant execute on function
  public.create_organization_for_current_user(text)
  to authenticated, service_role;

grant execute on function public.cancel_invitation(uuid)
  to authenticated, service_role;

commit;