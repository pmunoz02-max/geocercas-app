# Paddle Checkout org_id Normalization

## Problema

En producción se presentaba el error:

Missing org_id

Debido a que el frontend enviaba `orgId` mientras la Edge Function esperaba `org_id`.

## Solución

Se implementó normalización en:

supabase/functions/paddle-create-checkout/index.ts

La función ahora acepta:

- org_id
- orgId

y los convierte internamente a `org_id`.

## Beneficio

- Evita errores por diferencias de naming entre frontend y backend
- Mantiene compatibilidad con código existente
- Previene fallos en producción sin depender de cambios sincronizados

## Nota adicional

Este cambio no afecta lógica de negocio ni integración con Paddle.
Solo endurece el contrato del payload.