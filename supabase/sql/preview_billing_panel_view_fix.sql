-- Preview-only fix first.
-- Purpose: make v_billing_panel expose the real subscribed_plan_code.
-- Run only while linked to Preview: mujwsfhkocsuuahlrssn / pruebatugeo.

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
