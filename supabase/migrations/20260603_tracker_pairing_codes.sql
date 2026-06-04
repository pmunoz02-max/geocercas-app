begin;

create table if not exists public.tracker_pairing_codes (
  id uuid primary key default gen_random_uuid(),

  org_id uuid not null
    references public.organizations(id)
    on delete cascade,

  personal_id uuid not null
    references public.personal(id)
    on delete cascade,

  email text null,
  email_norm text null,

  code_hash text not null,
  code_version integer not null default 1,

  active boolean not null default true,

  max_uses integer not null default 1,
  use_count integer not null default 0,

  expires_at timestamp with time zone not null,

  used_at timestamp with time zone null,
  used_by_user_id uuid null
    references auth.users(id)
    on delete set null,

  revoked_at timestamp with time zone null,
  revoked_by uuid null
    references auth.users(id)
    on delete set null,

  created_by uuid null
    references auth.users(id)
    on delete set null,

  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  metadata jsonb not null default '{}'::jsonb,

  constraint tracker_pairing_codes_email_norm_lc_chk
    check (
      email_norm is null
      or email_norm = lower(trim(email_norm))
    ),

  constraint tracker_pairing_codes_code_version_chk
    check (code_version >= 1),

  constraint tracker_pairing_codes_max_uses_chk
    check (max_uses >= 1),

  constraint tracker_pairing_codes_use_count_chk
    check (use_count >= 0 and use_count <= max_uses),

  constraint tracker_pairing_codes_expires_after_created_chk
    check (expires_at > created_at)
);

create unique index if not exists tracker_pairing_codes_code_hash_active_uidx
  on public.tracker_pairing_codes (code_hash)
  where active = true
    and revoked_at is null
    and use_count < max_uses;

create index if not exists tracker_pairing_codes_org_personal_idx
  on public.tracker_pairing_codes (org_id, personal_id, created_at desc);

create index if not exists tracker_pairing_codes_org_active_idx
  on public.tracker_pairing_codes (org_id, active, expires_at);

create index if not exists tracker_pairing_codes_personal_active_idx
  on public.tracker_pairing_codes (personal_id, active, expires_at);

create index if not exists tracker_pairing_codes_used_by_user_idx
  on public.tracker_pairing_codes (used_by_user_id, created_at desc);

create or replace function public.set_updated_at_tracker_pairing_codes()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tracker_pairing_codes_updated_at
on public.tracker_pairing_codes;

create trigger trg_tracker_pairing_codes_updated_at
before update on public.tracker_pairing_codes
for each row
execute function public.set_updated_at_tracker_pairing_codes();

alter table public.tracker_pairing_codes enable row level security;

drop policy if exists tracker_pairing_codes_select_admin
on public.tracker_pairing_codes;

create policy tracker_pairing_codes_select_admin
on public.tracker_pairing_codes
for select
to authenticated
using (
  is_org_admin(org_id)
);

drop policy if exists tracker_pairing_codes_insert_admin
on public.tracker_pairing_codes;

create policy tracker_pairing_codes_insert_admin
on public.tracker_pairing_codes
for insert
to authenticated
with check (
  is_org_admin(org_id)
);

drop policy if exists tracker_pairing_codes_update_admin
on public.tracker_pairing_codes;

create policy tracker_pairing_codes_update_admin
on public.tracker_pairing_codes
for update
to authenticated
using (
  is_org_admin(org_id)
)
with check (
  is_org_admin(org_id)
);

drop policy if exists tracker_pairing_codes_delete_admin
on public.tracker_pairing_codes;

create policy tracker_pairing_codes_delete_admin
on public.tracker_pairing_codes
for delete
to authenticated
using (
  is_org_admin(org_id)
);

drop policy if exists tracker_pairing_codes_select_used_by_user
on public.tracker_pairing_codes;

create policy tracker_pairing_codes_select_used_by_user
on public.tracker_pairing_codes
for select
to authenticated
using (
  used_by_user_id = auth.uid()
);

grant select, insert, update, delete
on public.tracker_pairing_codes
to authenticated;

comment on table public.tracker_pairing_codes is
'Pairing codes for tracker onboarding. Code links authenticated Magic Link user to org/person; code is not identity.';

commit;