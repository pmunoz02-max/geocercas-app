# Paddle Cancel Subscription (Preview)

## Context

Se implementa la cancelación real de suscripciones Paddle desde la app.

Antes:
- El botón "Suspend plan" solo redirigía a una pantalla de cancelación de checkout (UI)
- No existía cancelación real de suscripción

Ahora:
- Se conecta el botón a una Edge Function que cancela la suscripción en Paddle

## Flujo

Usuario:
- Click en "Suspend plan"

Frontend:
- Llama a edge function `paddle-cancel-subscription`
- Envía `org_id`

Edge Function:
- Busca `paddle_subscription_id` en `org_billing`
- Valida `billing_provider = 'paddle'`
- Llama API Paddle:
  POST /subscriptions/{id}/cancel
  con `effective_from = next_billing_period`

Paddle:
- Marca suscripción como cancelada al final del periodo

Webhook:
- Recibe evento `subscription.updated` o `subscription.canceled`
- Actualiza en `org_billing`:
  - plan_status
  - cancel_at_period_end
  - canceled_at
  - current_period_end

## Reglas

- NO actualizar estado manualmente en la Edge Function
- Webhook es la única fuente de verdad del estado de suscripción
- Solo cancelar si `billing_provider = 'paddle'`
- No mezclar Stripe en este flujo

## Resultado

- Cancelación real de suscripción
- Estado sincronizado automáticamente
- Enforcement se mantiene desde backend