# Paddle Preview Checkout Status

## Context

Se continuó la integración de Paddle en preview para monetización por suscripción usando precios recurrentes.

## Cambios aplicados

### paddle-create-checkout
- Se estabilizó la Edge Function con manejo robusto de:
  - CORS
  - OPTIONS
  - parseo seguro de JSON
  - respuestas de error más claras
- Se usa Paddle Sandbox API.
- Se usa creación de transaction para obtener `checkout.url`.
- Se selecciona el precio según `plan_code`:
  - `pro` -> `PADDLE_PRO_PRICE_ID`
  - `enterprise` -> `PADDLE_ENTERPRISE_PRICE_ID`

### paddle-cancel-subscription
- Se dejó el flujo de cancelación real de suscripción Paddle desde Edge Function.
- La función se invoca desde frontend en vez de usar una ruta `/api/...`.

### paddle-webhook
- Se mantiene como punto de sincronización del estado real de suscripción y billing.
- La base de datos debe actualizarse desde webhook, no desde UI.

## Configuración validada

### Paddle Sandbox
- Producto único con dos precios recurrentes:
  - PRO 29 USD mensual
  - ENTERPRISE 99 USD mensual
- Se configuró `Default payment link` en Paddle Checkout settings para preview.

### Supabase Edge Function secrets
Se usan secrets para:
- `PADDLE_API_KEY`
- `PADDLE_PRO_PRICE_ID`
- `PADDLE_ENTERPRISE_PRICE_ID`

## Hallazgos

- Hubo errores por mezcla de vendor/API key y por falta de `Default payment link`.
- También hubo errores por diferencia entre Vercel env y Supabase Edge Function secrets.
- El flujo correcto debe depender de Supabase Edge Functions + Paddle Sandbox del mismo vendor.

## Estado actual

- El objetivo inmediato es confirmar que `paddle-create-checkout` devuelve `checkoutUrl` y que el frontend redirige correctamente a Paddle.
- Después de eso debe verificarse:
  - creación real de suscripción en Paddle
  - recepción de webhook
  - sincronización en `org_billing`

## Reglas

- Solo trabajar en `preview`
- No mezclar sandbox con live
- No depender de lógica de frontend para enforcement
- Supabase sigue siendo la fuente de verdad de entitlements