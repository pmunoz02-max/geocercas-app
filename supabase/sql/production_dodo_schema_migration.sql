-- Production Dodo schema migration.
-- DO NOT RUN until explicitly authorized.
-- Intended target: Supabase Production wpaixkvokdkudymgjoua / My Project.
-- This script is structural. It does not configure secrets, Edge Functions, Dodo LIVE products, or webhooks.

begin;

-- 1) Add Dodo columns to org_billing.
alter table public.org_billing
  add column if not exists dodo_customer_id text,
  add column if not exists dodo_subscription_id text,
  add column if not exists dodo_product_id text,
  add column if not exists dodo_checkout_session_id text,
  add column if not exists dodo_payment_id text,
  add column if not exists last_dodo_event_at timestamp with time zone;

-- 2) Ensure billing_provider accepts Dodo.
alter table public.org_billing
  drop constraint if exists org_billing_provider_ck;

alter table public.org_billing
  add constraint org_billing_provider_ck
  check (
    billing_provider is null
    or billing_provider = any (array['stripe'::text, 'paddle'::text, 'dodo'::text])
  );

-- 3) Create Dodo webhook audit table.
create table if not exists public.dodo_webhook_events (
  event_id text primary key,
  event_type text,
  org_id uuid,
  subscription_id text,
  customer_id text,
  payment_id text,
  product_id text,
  status text,
  received_at timestamp with time zone not null default now(),
  processed_at timestamp with time zone,
  payload_summary jsonb not null default '{}'::jsonb,
  error_detail text
);

-- 4) RLS. Edge Functions with service role can write while normal clients cannot read/write by default.
alter table public.dodo_webhook_events enable row level security;

-- 5) Indexes used for webhook traceability and diagnostics.
create index if not exists dodo_webhook_events_org_id_idx
  on public.dodo_webhook_events using btree (org_id);

create index if not exists dodo_webhook_events_subscription_id_idx
  on public.dodo_webhook_events using btree (subscription_id);

create index if not exists dodo_webhook_events_received_at_idx
  on public.dodo_webhook_events using btree (received_at desc);

-- 6) Permanent billing panel correction.
create or replace view public.v_billing_panel as
select
  ob.org_id,
  o.name as org_name,
  o.slug,
  o.is_personal,
  ob.plan_code as billing_plan_code,
  ob.subscribed_plan_code as subscribed_plan_code,
  obe.effective_plan_code,
  ob.plan_status,
  ob.trial_ends_at as trial_end,
  ob.current_period_end,
  ob.over_limit as billing_over_limit,
  ob.over_limit_reason,
  ob.billing_provider,
  oe.max_geocercas,
  oe.max_trackers,
  count_live_geocercas(ob.org_id) as geocercas_used,
  count_active_trackers(ob.org_id) as trackers_used,
  k.active_trackers_24h,
  k.active_trackers_7d,
  k.active_trackers_30d,
  k.invites_sent_total,
  k.invites_accepted_total,
  k.assignments_created_total,
  k.assignments_completed_total,
  k.first_event_at,
  k.last_event_at,
  ob.updated_at
from public.org_billing ob
join public.organizations o on o.id = ob.org_id
join public.org_billing_effective obe on obe.org_id = ob.org_id
join public.org_entitlements oe on oe.org_id = ob.org_id
left join public.v_org_kpis k on k.org_id = ob.org_id;

commit;
