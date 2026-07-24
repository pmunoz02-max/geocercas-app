# Dodo webhook stale cancellation guard — Preview

Date: 2026-06-28
Environment: Supabase Preview (`mujwsfhkocsuuahlrssn`)
Production: not touched

## Problem found in TEST

During Dodo TEST upgrade validation, an Enterprise checkout created a new Enterprise subscription and updated `org_billing` correctly. After manual cleanup, a delayed/old `subscription.cancelled` event from the previous Dodo subscription reached the webhook and overwrote the organization's current billing row as `canceled`.

This is unsafe because webhook events can arrive late, be replayed, or refer to subscriptions that are no longer the active subscription for the organization.

## Permanent rule

A Dodo cancellation event may update `public.org_billing` only when:

```text
incoming subscription_id == org_billing.dodo_subscription_id
```

If the incoming cancellation belongs to an old/replaced subscription, the webhook must:

```text
- insert the event in dodo_webhook_events
- mark it as ignored
- set error_detail = stale_subscription_cancelled
- leave org_billing unchanged
```

## Files changed

```text
supabase/functions/dodo-webhook/index.ts
```

## Validation target

After deploying this patch, replaying a cancellation event for an older subscription must not change the current active plan, current subscription ID, product ID, or plan status.

Expected current Enterprise row used during TEST:

```text
org_id: 5b03d60f-b312-4cd0-b2bc-365a84237d79
plan_code: enterprise
plan_status: active
billing_provider: dodo
dodo_subscription_id: sub_0Ni2HnlMtotFVuhzGCIDp
dodo_product_id: pdt_0NhoND6E41RsKWVP43fW1
```

## Notes

This patch does not change Stripe/Paddle behavior and does not touch Production.

## Protección complementaria para eventos activos antiguos

Como refuerzo adicional, el webhook también protege la ruta de activación: una suscripción Dodo activa existente no puede ser reemplazada por un evento activo que traiga otro `subscription_id`.

Cuando `org_billing` ya está en `billing_provider = dodo` y `plan_status = active`, si entra un evento de activación con un `subscription_id` distinto del actual, el evento se marca como ignorado con:

```text
error_detail = stale_active_event_for_replaced_subscription
```

En ese caso, no se modifica `org_billing`.

También se confirma que el cambio de plan PRO a Enterprise conserva el mismo `subscription_id`, por lo que este guard no bloquea upgrades válidos.

Validación realizada:

```text
- deno check
- deploy en Preview
- GET de verificación en Preview
```

Producción no fue tocada.
