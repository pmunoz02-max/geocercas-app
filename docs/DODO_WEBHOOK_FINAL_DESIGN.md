# Dodo Webhook Definitivo — Diseño Preview

Estado: diseño técnico previo a implementación.
Ambiente: Preview solamente.
Fecha: 2026-06-27.

## Regla operativa

No tocar Producción.

- Preview Supabase: `mujwsfhkocsuuahlrssn`
- Producción Supabase: `wpaixkvokdkudymgjoua`
- Branch de trabajo: `preview`
- No `Promote to Production` sin orden explícita.
- No modificar Stripe/Paddle legacy.
- No tocar Android.

## Evidencia capturada en Dodo TEST

Endpoint temporal usado:

```text
https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/dodo-webhook-test-capture
```

Dodo TEST envió eventos con estructura superior:

```json
{
  "business_id": "...",
  "data": { "...": "..." },
  "timestamp": "...",
  "type": "..."
}
```

Eventos reales observados:

- `payment.succeeded`
- `subscription.renewed`
- `subscription.active`
- `subscription.updated`

Product IDs TEST observados:

| Plan interno | Dodo TEST product_id |
|---|---|
| `pro` | `pdt_0NhoMPN43aL0XnHSZhrTk` |
| `enterprise` | `pdt_0NhoND6E41RsKWVP43fW1` |

Campos útiles observados:

- `type`
- `timestamp`
- `business_id`
- `data.product_id`
- `data.subscription_id`
- `data.payment_id`
- `data.invoice_id`
- `data.checkout_session_id`
- `data.status`
- `data.currency`
- `data.total_amount`
- `data.recurring_pre_tax_amount`
- `data.payment_frequency_interval`
- `data.next_billing_date`

## Función definitiva propuesta

Crear una función nueva, separada de la función temporal:

```text
supabase/functions/dodo-webhook
```

No reutilizar ni modificar:

- `stripe-webhook`
- `paddle-webhook`
- `stripe-create-checkout`
- `paddle-create-checkout`

## Responsabilidad de `dodo-webhook`

La función definitiva debe:

1. Recibir solo eventos Dodo.
2. Leer el raw body antes de parsear JSON.
3. Verificar firma del webhook con el signing secret de Dodo TEST.
4. Rechazar payloads sin firma válida.
5. Parsear JSON solo después de la validación.
6. Registrar evento de forma idempotente.
7. Mapear `product_id` externo a `plan_code` interno.
8. Actualizar `org_billing` solo cuando exista una relación confiable con una organización interna.
9. Registrar errores sin exponer payload sensible.

## Verificación de firma

El webhook definitivo no debe confiar solo en que el request llegue al endpoint.

Debe usar el raw request body y la firma enviada por Dodo. En las pruebas Dodo TEST envió `webhook-signature` y `user-agent` de Svix. Antes de activar escritura real, confirmar el signing secret y el conjunto exacto de headers que Dodo exige para verificación.

Secrets esperados en Supabase Preview:

```text
DODO_WEBHOOK_SECRET_TEST
DODO_PRODUCT_ID_PRO_TEST
DODO_PRODUCT_ID_ENTERPRISE_TEST
```

No pegar secretos en chat.

## Eventos a procesar

Eventos principales para suscripción:

- `subscription.active`
- `subscription.updated`
- `subscription.renewed`

Evento de auditoría de pago:

- `payment.succeeded`

Regla inicial:

- El cambio de plan debe depender principalmente de eventos `subscription.*`.
- `payment.succeeded` puede registrarse para auditoría, pero no debe ser el único evento para activar un plan.

## Mapeo de producto a plan

```text
pdt_0NhoMPN43aL0XnHSZhrTk -> pro
pdt_0NhoND6E41RsKWVP43fW1 -> enterprise
```

El mapeo debe vivir en configuración/secrets o tabla interna, no hardcodeado en múltiples lugares.

## Idempotencia

El payload capturado no mostró un `event_id` claro en el resumen. Por eso el diseño debe soportar dos niveles:

1. Si Dodo/Svix entrega un ID de mensaje/evento verificable, usarlo como clave idempotente.
2. Si no existe, generar una clave determinística con una combinación segura, por ejemplo:

```text
provider = dodo
event_type
subscription_id o payment_id
product_id
timestamp
hash del raw body
```

La tabla de eventos debe tener constraint único para impedir reprocesamiento.

## Tablas propuestas para implementación Preview

No crear todavía sin auditoría final SQL.

Propuesta conceptual:

```text
dodo_event_log
```

Campos mínimos:

- `id uuid primary key`
- `event_key text unique not null`
- `event_type text not null`
- `provider text not null default 'dodo'`
- `product_id text`
- `plan_code text`
- `subscription_id text`
- `payment_id text`
- `invoice_id text`
- `checkout_session_id text`
- `business_id text`
- `status text`
- `current_period_end timestamptz`
- `received_at timestamptz not null default now()`
- `processed_at timestamptz`
- `processing_status text not null default 'received'`
- `error_message text`
- `summary jsonb`

No guardar:

- payload crudo completo
- tarjeta
- billing address
- emails
- nombres
- enlaces invoice/payment

## Relación con `org_billing`

La actualización de `org_billing` requiere una forma confiable de asociar una compra Dodo con una organización interna.

Opciones:

1. Enviar `org_id` en metadata/custom data del checkout Dodo.
2. Crear sesión de checkout server-side desde la app con metadata interna.
3. Registrar una tabla previa `billing_checkout_sessions` con `checkout_session_id -> org_id`.

No activar plan si no se puede resolver `org_id` con seguridad.

## Pendientes antes de implementar

1. Confirmar cómo pasar `org_id` o `checkout_session_id` desde checkout Dodo.
2. Confirmar signing secret TEST de Dodo.
3. Confirmar headers exactos para verificación.
4. Auditar constraint actual de `org_billing.billing_provider`.
5. Preparar SQL mínimo para Preview.
6. Probar con una organización interna de Preview.
7. Documentar rollback.

## Comandos prohibidos hasta implementación autorizada

```powershell
supabase db push
supabase db pull
supabase db reset
supabase migration repair
supabase functions deploy dodo-webhook --project-ref wpaixkvokdkudymgjoua
supabase secrets set ... --project-ref wpaixkvokdkudymgjoua
```

