-- OPTIONAL Production cleanup for fictitious accounts.
-- DO NOT RUN until explicitly authorized.
-- Leaves fenice.ecuador untouched.
-- Purpose: reset fictitious/test organizations to free/inactive before Dodo LIVE tests.

begin;

update public.org_billing b
set
  plan_code = 'free',
  subscribed_plan_code = 'free',
  plan_status = 'inactive',
  billing_provider = null,
  stripe_customer_id = null,
  stripe_subscription_id = null,
  stripe_price_id = null,
  paddle_customer_id = null,
  paddle_subscription_id = null,
  paddle_price_id = null,
  dodo_customer_id = null,
  dodo_subscription_id = null,
  dodo_product_id = null,
  dodo_checkout_session_id = null,
  dodo_payment_id = null,
  current_period_end = null,
  cancel_at_period_end = false,
  canceled_at = null,
  last_stripe_event_at = null,
  last_paddle_event_at = null,
  last_dodo_event_at = null,
  tracker_limit_override = null,
  updated_at = now()
from public.organizations o
where o.id = b.org_id
  and o.name in ('ruebageo', 'pruebatugeo', 'diamondwolf3505', 'pmunoz02')
  and o.name <> 'fenice.ecuador';

update public.organizations
set
  plan = 'free',
  updated_at = now()
where name in ('ruebageo', 'pruebatugeo', 'diamondwolf3505', 'pmunoz02')
  and name <> 'fenice.ecuador';

commit;
