# Recuperación de billing Preview — 9 Ago 2026

## Resumen

Se recuperó el estado de billing del entorno Preview tras detectar inconsistencias heredadas de Stripe legacy y errores de configuración en Paddle Sandbox.

La recuperación se realizó exclusivamente en Preview.

## Acciones realizadas

- Stripe legacy:
  - Se identificó una organización con estado histórico `PRO + trialing + stripe` cuyo trial había expirado en marzo de 2026.
  - Se normalizó su estado comercial a Free/inactive.
  - Se preservaron los identificadores Stripe históricos y la información de trial consumido para mantener la trazabilidad y la protección anti-trial.

- Paddle Sandbox API:
  - Se detectó que las API keys Sandbox existentes estaban expiradas o revocadas.
  - Se generó una nueva API key Sandbox con permisos suficientes para crear transacciones.
  - Se actualizó únicamente `PADDLE_API_KEY_SANDBOX` en Supabase Preview.

- Paddle webhook:
  - Los pagos se completaban correctamente, pero los webhooks fallaban con `signature mismatch`.
  - Se corrigió `PADDLE_WEBHOOK_SECRET` utilizando el endpoint secret key correcto del Notification Destination de Paddle Sandbox.
  - El destino del webhook fue confirmado contra el proyecto Supabase Preview correcto.

- Checkout Enterprise:
  - Se validó el checkout Paddle Sandbox.
  - Se confirmó la recepción y procesamiento de `transaction.completed`.
  - El webhook actualizó correctamente `org_billing`.
  - El proveedor de checkout ahora se selecciona con `VITE_BILLING_PROVIDER`, y en Preview se usa `paddle`.
  - Paddle determina sandbox/live con `getPaddleEnv` según el hostname, y el mismo build promovido funciona en Preview y Producción.

## Estado final validado

La organización de prueba terminó con:

- `plan_code = enterprise`
- `subscribed_plan_code = enterprise`
- `plan_status = active`
- `billing_provider = paddle`
- `paddle_customer_id` presente
- `paddle_subscription_id` presente
- `paddle_price_id` presente

`current_period_end` quedó `NULL` y deberá revisarse por separado para determinar si debe poblarse desde eventos de suscripción.

## Resultado

- Billing Preview recuperado.
- Checkout Paddle Sandbox operativo.
- Webhook Paddle validado.
- Enterprise activo correctamente desde webhook.
- Historial Stripe legacy preservado.
- Protección anti-trial preservada.
- Durante la recuperación de Preview descrita en este documento no se realizaron cambios en Producción.
