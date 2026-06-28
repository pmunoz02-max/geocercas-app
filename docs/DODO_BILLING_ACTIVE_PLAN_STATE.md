# Dodo billing active plan state — Preview

## Context

The Dodo TEST checkout and signed webhook were validated in Supabase Preview. A Dodo payment and subscription event updated `public.org_billing` with:

- `billing_provider = 'dodo'`
- `plan_code = 'pro'`
- `subscribed_plan_code = 'pro'`
- `plan_status = 'active'`
- `current_period_end` populated from the subscription event

The `/pricing` page already reflects this state and no longer shows the PRO checkout button when the current organization is already PRO.

## Issue fixed

The `/billing` page still displayed the PRO upgrade box because it relied primarily on `v_billing_panel`, which may not yet expose the Dodo provider fields or the latest Dodo plan state.

## Change

`src/pages/Billing.jsx` now reads `public.org_billing` directly in addition to `v_billing_panel` and merges the Dodo billing state into the page model.

When the current organization has an active paid Dodo plan:

- the PRO subscription button is hidden,
- the active plan banner is shown,
- plan status is shown as active,
- provider is shown as DODO,
- the current billing period date is shown when available.

## Scope

- Preview branch only.
- Supabase Preview only.
- No Production changes.
- No Promote to Production.
- No Stripe/Paddle logic removed.

## Validation expected

After deployment to Vercel Preview:

1. Open `/billing` with an authenticated admin account.
2. Confirm the organization that was activated by Dodo TEST.
3. The page should no longer show `Suscribirme a PRO` for that organization.
4. The page should show the current active PRO state.
