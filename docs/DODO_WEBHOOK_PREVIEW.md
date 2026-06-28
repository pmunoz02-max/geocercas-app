# Dodo webhook definitivo en Preview

Estado: implementación preparada para Preview. No usar en Producción sin una orden explícita y sin reemplazar secrets TEST por LIVE.

## Alcance

Función nueva:

```text
supabase/functions/dodo-webhook
```

Endpoint Preview esperado:

```text
https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/dodo-webhook
```

La función se despliega con `verify_jwt = false` porque Dodo llama el webhook desde fuera de Supabase. La seguridad se basa en la firma del webhook, no en JWT de usuario.

## Secrets usados en Preview

```text
DODO_WEBHOOK_SECRET_TEST
DODO_PRODUCT_ID_PRO_TEST
DODO_PRODUCT_ID_ENTERPRISE_TEST
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son variables del runtime de Supabase Edge Functions. No deben copiarse al cliente.

## Verificación de firma

La función lee el cuerpo crudo con `req.text()` y verifica la firma antes de parsear JSON. Acepta headers estilo Svix/Dodo:

```text
svix-id / webhook-id
svix-timestamp / webhook-timestamp
svix-signature / webhook-signature
```

La tolerancia de timestamp es de 5 minutos para reducir riesgo de replay.

## Escrituras realizadas

La función escribe con service role en:

```text
public.dodo_webhook_events
public.org_billing
```

No escribe en tablas Stripe ni Paddle.

## Idempotencia

Dodo no expuso `event_id` en las capturas TEST observadas, por lo que la función usa:

```text
payload.id || payload.event_id || data.event_id
```

Si no existe, genera una clave estable:

```text
dodo:{event_type}:{payment_id|subscription_id|checkout_session_id}:{updated_at|created_at|timestamp}
```

La tabla `dodo_webhook_events.event_id` es primary key. Si Dodo reintenta el mismo evento, la función responde `duplicate: true` sin reactivar dos veces.

## Activación de plan

Activa `org_billing` cuando recibe:

```text
payment.succeeded con status succeeded
subscription.* con status active
```

Campos actualizados:

```text
plan_code
subscribed_plan_code
plan_status = active
billing_provider = dodo
current_period_end si Dodo envía next_billing_date
cancel_at_period_end = false
dodo_customer_id
dodo_subscription_id
dodo_product_id
dodo_checkout_session_id
dodo_payment_id
last_dodo_event_at
updated_at
```

## Cancelación

Eventos con tipo o status de cancelación/expiración dejan:

```text
plan_status = canceled
billing_provider = dodo
cancel_at_period_end = true
canceled_at = now()
last_dodo_event_at = now()
```

No se borra información histórica de Dodo.

## Esquema aplicado manualmente en Preview

Se aplicó por CLI con `supabase db query --linked`, no por `db push`:

```text
org_billing_provider_ck ahora acepta stripe, paddle, dodo.
org_billing tiene columnas dodo_* y last_dodo_event_at.
public.dodo_webhook_events existe con RLS enabled.
```

## Prueba recomendada

1. Desplegar función en Preview.
2. Confirmar que un POST manual sin firma devuelva 401.
3. Cambiar el endpoint TEST en Dodo a `/functions/v1/dodo-webhook`.
4. Hacer compra TEST desde la app con botón integrado.
5. Consultar `dodo_webhook_events` y `org_billing` en Preview.

## Prohibido en esta fase

```text
No Production
No main
No db push
No db pull
No db reset
No migration repair
No LIVE keys
No checkout productivo
```
