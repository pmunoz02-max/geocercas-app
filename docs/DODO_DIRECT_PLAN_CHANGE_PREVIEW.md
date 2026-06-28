# Dodo direct plan change in Preview

Date: 2026-06-28
Environment: Supabase Preview only (`mujwsfhkocsuuahlrssn`). Production was not modified.

## Purpose

Prevent duplicate Dodo subscriptions when an organization with an active PRO plan upgrades to Enterprise.

## Behavior

`dodo-create-checkout` now keeps checkout creation only for new paid subscriptions:

- FREE / inactive organization → can create Dodo checkout for PRO or Enterprise.
- Active PRO organization → Enterprise uses Dodo subscription `change-plan` against the existing `dodo_subscription_id`.
- Active Enterprise organization → cannot create another paid plan.
- Active PRO organization → cannot buy PRO again.

## Dodo API

For PRO → Enterprise, the function calls:

`POST /subscriptions/{subscription_id}/change-plan`

with:

- `product_id`: Dodo Enterprise product id.
- `proration_billing_mode`: `prorated_immediately`.
- `quantity`: `1`.
- `effective_at`: `immediately`.
- `on_payment_failure`: `prevent_change`.
- `metadata`: `org_id`, `plan_code`, `checkout_intent`, `current_plan_code`, `current_plan_status`, and source fields.

## Frontend handling

`UpgradeToProButton` still calls `dodo-create-checkout`. If the function returns a `checkout_url`, the browser opens Dodo Checkout. If the function returns `change_plan_completed`, the browser redirects back to Billing so webhooks can refresh the plan state.

## Validation checklist

- PRO active organization: `Upgrade to Enterprise` must not open a second checkout session for a new subscription.
- Dodo webhook should process subscription/payment events and update `org_billing` to Enterprise when Dodo confirms the change.
- Enterprise active organization should not be allowed to purchase another plan.

## Safety

No Production changes. No Stripe/Paddle changes. No demo data in Production.
