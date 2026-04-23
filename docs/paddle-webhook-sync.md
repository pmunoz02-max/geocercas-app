# Paddle Webhook Sync – org_billing

## Contexto

Se actualizó la función:

- supabase/functions/paddle-webhook/index.ts

Objetivo:

- Sincronizar correctamente el estado de suscripciones Paddle con `org_billing`
- Evitar desalineación entre Paddle y la base de datos

---

## Regla principal

`org_billing` es la fuente de verdad para la app.

---

## Eventos manejados

### subscription.updated

Cuando existe `scheduled_change`:

- cancel_at_period_end = true
- scheduled_change_action = 'cancel'
- scheduled_change_effective_at = payload.effective_at

Cuando NO existe `scheduled_change`:

- cancel_at_period_end = false
- limpiar scheduled_change_*

---

### subscription.canceled

- plan_status = 'canceled'
- cancel_at_period_end = false
- canceled_at = occurred_at
- limpiar scheduled_change_*

---

## Idempotencia

Se usa:

- last_paddle_event_at

Regla:

- ignorar eventos con `occurred_at` menor al último procesado

---

## Regla de acceso en app
