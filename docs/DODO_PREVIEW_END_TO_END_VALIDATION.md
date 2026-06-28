# Dodo Preview end-to-end validation

Date: 2026-06-28
Scope: Preview only

## Environment

- Supabase Preview project: `mujwsfhkocsuuahlrssn`
- Supabase Production project: `wpaixkvokdkudymgjoua`
- Branch: `preview`
- Production was not touched.
- No promote to Production was performed.

## Validated Dodo TEST products

- PRO: `pdt_0NhoMPN43aL0XnHSZhrTk`
- Enterprise: `pdt_0NhoND6E41RsKWVP43fW1`

## Validated functions

- `dodo-create-checkout`
  - Uses authenticated session.
  - Uses current `org_id`.
  - Allows checkout according to current plan guard.
  - FREE/inactive orgs may open PRO or Enterprise checkout.
  - PRO active orgs may open Enterprise upgrade checkout.
  - Enterprise active orgs are blocked from starting another checkout.

- `dodo-webhook`
  - Runs without Supabase JWT because Dodo does not send Supabase Authorization.
  - Verifies Dodo/Svix webhook signature using `DODO_WEBHOOK_SECRET_TEST`.
  - Writes events to `public.dodo_webhook_events`.
  - Updates `public.org_billing` only after signed webhook events are processed.
  - Resolves plan by confirmed product id when product id is present.
  - Ignores stale cancellation events when the cancelled subscription is not the current `org_billing.dodo_subscription_id`.

## Preview database changes applied manually by CLI

`public.org_billing`

- Constraint `org_billing_provider_ck` was updated to allow `dodo` in addition to `stripe` and `paddle`.
- Dodo columns were added:
  - `dodo_customer_id`
  - `dodo_subscription_id`
  - `dodo_product_id`
  - `dodo_checkout_session_id`
  - `dodo_payment_id`
  - `last_dodo_event_at`

`public.dodo_webhook_events`

- Created for signed Dodo event tracking.
- Enabled RLS.
- Indexes created for org, subscription, and received date.

## Secrets required in Supabase Preview

- `DODO_API_KEY_TEST`
- `DODO_CAPTURE_READ_KEY`
- `DODO_PRODUCT_ID_PRO_TEST`
- `DODO_PRODUCT_ID_ENTERPRISE_TEST`
- `DODO_WEBHOOK_SECRET_TEST`

The webhook secret must be obtained from the exact Dodo webhook endpoint. In testing, copying the visible secret manually caused `invalid_webhook_signature`; the secret retrieved through Dodo API for endpoint `ep_3FlVmNYk26C6Tme0yOItTKFeQPN` fixed the issue.

## End-to-end results validated

### PRO checkout

- App button opened Dodo TEST checkout.
- Dodo generated signed events.
- `payment.succeeded`, `subscription.active`, and `subscription.renewed` were processed.
- `org_billing` was updated to:
  - `plan_code = pro`
  - `subscribed_plan_code = pro`
  - `plan_status = active`
  - `billing_provider = dodo`
  - `dodo_product_id = pdt_0NhoMPN43aL0XnHSZhrTk`

### Enterprise checkout from PRO

- App button opened Dodo TEST Enterprise checkout.
- Enterprise TEST payment succeeded.
- Signed Dodo events were processed.
- `org_billing` was updated to:
  - `plan_code = enterprise`
  - `subscribed_plan_code = enterprise`
  - `plan_status = active`
  - `billing_provider = dodo`
  - `dodo_subscription_id = sub_0Ni2HnlMtotFVuhzGCIDp`
  - `dodo_product_id = pdt_0NhoND6E41RsKWVP43fW1`
  - `current_period_end = 2026-07-28 15:51:52.219+00`

### Stale cancellation guard

A cancellation event from an older subscription previously overwrote the current organization state. The webhook was patched so that a cancellation only updates `org_billing` if the cancelled subscription id matches the current `org_billing.dodo_subscription_id`.

Validated final Dodo TEST state:

- Old subscription: `sub_0Ni1ft7HewyxnWI6lXDwI` → `cancelled`
- Current Enterprise subscription: `sub_0Ni2HnlMtotFVuhzGCIDp` → `active`

## Frontend validation

- `/pricing` reflects active Dodo plan state.
- `/billing` reflects active Dodo plan state.
- EN/FR billing banner text was corrected.
- PRO active orgs no longer show “Subscribe to PRO”.
- PRO active orgs show Enterprise upgrade CTA.
- Enterprise active orgs should not show another purchase/upgrade CTA.

## Production readiness notes

Before promoting or applying to Production:

1. Confirm Dodo LIVE products and webhook endpoint.
2. Add LIVE secrets only to the Production Supabase project, never to Preview.
3. Apply the database schema changes to Production intentionally and separately.
4. Re-run the full checkout + signed webhook validation in LIVE-safe mode.
5. Decide the final commercial behavior for PRO to Enterprise upgrades:
   - checkout-based upgrade with cancellation of the old subscription, or
   - direct Dodo subscription plan change without a checkout screen.
6. Ensure stale subscription events can never cancel or downgrade the currently active subscription.

## Safety rules

- Do not run `supabase db push`, `db pull`, `db reset`, or `migration repair` for this flow.
- Do not link the app repo to the Production project.
- Do not promote Preview to Production until the Dodo LIVE flow has been explicitly approved.
- Do not paste Dodo API keys, webhook secrets, JWTs, or customer data into chat or docs.
