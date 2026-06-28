# Dodo Production audit and migration plan

Date: 2026-06-28
Project: App Geocercas / GeoField GPS
Working branch: preview
Supabase Preview: mujwsfhkocsuuahlrssn / pruebatugeo
Supabase Production: wpaixkvokdkudymgjoua / My Project

## Operating rules

- Work only from branch `preview`.
- Do not push to `main`.
- Do not Promote to Production unless explicitly ordered.
- Do not mix Preview and Production.
- Do not upload demo data to Production.
- Do not paste secrets in chat or commit secrets to Git.
- Any Production action must be reviewed and executed step by step.

## Production read-only audit summary

Production is still in the previous monetization schema state. It has Stripe/Paddle columns in `public.org_billing`, but it does not yet have the Dodo columns, Dodo provider constraint, or `public.dodo_webhook_events` table.

Production currently has `billing_provider = NULL` for all audited `org_billing` rows. The only real account is `fenice.ecuador`, which is the app owner account. The other audited accounts are fictitious/test accounts.

## Preview reference schema

Preview has the validated Dodo structure:

- `org_billing` Dodo columns:
  - `dodo_customer_id text null`
  - `dodo_subscription_id text null`
  - `dodo_product_id text null`
  - `dodo_checkout_session_id text null`
  - `dodo_payment_id text null`
  - `last_dodo_event_at timestamptz null`
- `org_billing_provider_ck` accepts `stripe`, `paddle`, and `dodo`.
- `dodo_webhook_events` exists.
- RLS is enabled on `dodo_webhook_events`.
- Indexes exist for `org_id`, `subscription_id`, and `received_at desc`.

## Important view issue

Both Preview and Production currently define `v_billing_panel` as:

```sql
ob.plan_code AS subscribed_plan_code
```

The permanent correction should be:

```sql
ob.subscribed_plan_code AS subscribed_plan_code
```

This should be applied first in Preview, validated, and only later applied in Production.

## Recommended execution order

### Phase 1 — Preview safety fix

1. Apply `preview_billing_panel_view_fix.sql` in Preview.
2. Validate `/billing` and `/pricing` in Vercel Preview.
3. Commit this documentation and SQL to branch `preview`.

### Phase 2 — Production structural Dodo migration

Only after explicit authorization:

1. Temporarily relink to Production.
2. Run `production_dodo_schema_migration.sql`.
3. Run read-only verification.
4. Relink immediately back to Preview.

### Phase 3 — Optional fictitious account cleanup

Only after explicit authorization:

1. Review `production_fake_accounts_cleanup_optional.sql`.
2. Confirm that only fictitious accounts are affected.
3. Execute only if desired.
4. Leave `fenice.ecuador` untouched.

## Not included yet

The following are not executed by these SQL scripts:

- Dodo LIVE products creation.
- Dodo LIVE secrets configuration.
- Dodo LIVE webhook creation.
- Edge Function deployment to Production.
- Vercel Promote to Production.

Those are separate steps and require explicit authorization.
