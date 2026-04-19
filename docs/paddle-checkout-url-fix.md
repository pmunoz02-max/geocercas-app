# Paddle Checkout URL Fix (Preview)

## Context

En preview, `paddle-create-checkout` ya estaba creando transacciones en Paddle Sandbox, pero el frontend no redirigía correctamente al checkout.

## Problema detectado

- Se generaba `txn_...` en la URL de retorno.
- No aparecía un error visible de frontend.
- No se veía redirección efectiva al checkout hospedado de Paddle.
- El cuello de botella estaba en no devolver explícitamente `checkout_url` desde la Edge Function.

## Ajuste realizado

### Edge Function `paddle-create-checkout`
- Se corrigió la extracción de la URL de checkout desde la respuesta de Paddle.
- Se devuelve explícitamente:
  - `ok: true`
  - `checkout_url`

### Frontend
- El botón de upgrade debe redirigir usando `window.location.href = data.checkout_url`.

## Flujo esperado

1. Usuario hace click en `Suscribirme a PRO`
2. Frontend invoca `paddle-create-checkout`
3. Edge Function crea transaction en Paddle Sandbox
4. Edge Function extrae y devuelve `checkout_url`
5. Frontend redirige al checkout hospedado
6. Usuario completa pago
7. Paddle crea suscripción
8. Webhook sincroniza `org_billing`

## Reglas

- Solo en `preview`
- Solo Paddle Sandbox
- No mezclar con Live
- No depender de UI para activar plan
- Webhook sigue siendo la fuente de verdad para estado de suscripción