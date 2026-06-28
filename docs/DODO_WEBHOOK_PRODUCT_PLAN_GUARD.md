# Dodo webhook product-plan guard (Preview)

Date: 2026-06-28
Project: Supabase Preview `mujwsfhkocsuuahlrssn`
Environment: Dodo TEST only

## Purpose

Prevent `org_billing` from being upgraded by metadata alone when Dodo payment events do not include a product id.

## Rule

- If Dodo sends `product_id`, the plan is derived from the product id.
- Metadata `plan_code` is only a fallback when no product id is available.
- For payment events without a product id, if the event belongs to an already-known Dodo subscription, metadata cannot override the product already stored for that subscription.
- A real PRO → Enterprise change must be confirmed by a `subscription.*` event with the Enterprise product id.

## Why

During Preview testing, a payment event with metadata indicating Enterprise could arrive while the subscription still carried the PRO product id. The webhook must not mark the organization Enterprise until the subscription product itself confirms the change.

## Production status

Production was not touched. This guard is for Preview validation before any promotion.
