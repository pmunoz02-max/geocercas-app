# Dodo Checkout Plan Guard and Billing i18n — Preview

Date: 2026-06-28
Scope: Preview only (`mujwsfhkocsuuahlrssn`). Production was not touched.

## Purpose

This change prevents duplicate or invalid Dodo checkout flows from the app and improves the visible EN/FR fallback copy on the Billing page.

## Checkout rules enforced by `dodo-create-checkout`

The backend now reads `public.org_billing` before creating a Dodo checkout session.

Rules:

- Free or inactive organizations may start checkout for PRO or Enterprise.
- Active PRO organizations may only start an Enterprise upgrade checkout.
- Active Enterprise organizations cannot start another checkout.
- Active PRO organizations cannot start another PRO checkout.

The function adds metadata to Dodo checkouts:

- `org_id`
- `plan_code`
- `checkout_intent`
- `source`
- `environment`
- `requested_by`
- `current_plan_code`
- `current_plan_status`
- `existing_dodo_subscription_id` when present

## Billing page language fallback

`src/pages/Billing.jsx` now uses language-aware fallbacks for the Dodo billing banner:

- ES: Plan y pagos / Plan actual / Estado / Período actual hasta / Proveedor / Subir a Enterprise
- EN: Plan & payments / Current plan / Status / Current period until / Provider / Upgrade to Enterprise
- FR: Plan et paiements / Plan actuel / Statut / Période actuelle jusqu’au / Fournisseur / Passer à Enterprise

## Notes before production

The current TEST flow can initiate an Enterprise checkout from PRO. Before enabling live production billing, the final upgrade flow must define whether the existing PRO subscription is changed in-place, canceled, or replaced by provider-side subscription management.
