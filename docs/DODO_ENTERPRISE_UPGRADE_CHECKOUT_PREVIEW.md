# Dodo Enterprise upgrade checkout — Preview

## Context

The previous Preview attempt used Dodo direct subscription plan change for `PRO -> Enterprise`. That did not open the Dodo checkout interface and created confusing behavior during validation.

## Current Preview behavior

`dodo-create-checkout` now keeps the existing plan guard but opens Dodo Checkout for an active PRO organization upgrading to Enterprise.

Rules:

- `FREE` / inactive orgs can open checkout for `PRO` or `Enterprise`.
- Active `PRO` orgs can open checkout only for `Enterprise`.
- Active `Enterprise` orgs cannot open another purchase.
- Active `PRO` orgs cannot buy `PRO` again.

The checkout metadata includes:

- `org_id`
- `plan_code`
- `checkout_intent`
- `current_plan_code`
- `current_plan_status`
- `existing_dodo_subscription_id`

## Safety rule

The Dodo webhook must not activate Enterprise based only on metadata. Enterprise activation must depend on signed webhook events that confirm the Enterprise product id.

## Production note

Before Production, the upgrade flow must handle the old PRO subscription safely after Enterprise payment succeeds. Options include cancelling/replacing the prior PRO subscription or using an official Dodo subscription-change flow once fully validated.

Production was not modified.
