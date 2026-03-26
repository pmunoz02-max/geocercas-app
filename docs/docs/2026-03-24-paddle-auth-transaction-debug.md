@"
# Paddle checkout debug - 2026-03-24

## Scope
Preview only. No producción.

## Cambio
Se agregó diagnóstico temporal en `supabase/functions/paddle-create-checkout/index.ts` para:
- probar autenticación contra `/event-types`
- loguear status/body de autenticación
- loguear status/body de creación de transacción

## Objetivo
Determinar si la API key sandbox autentica correctamente y si tiene permisos para crear transacciones en Paddle.

## Riesgo
Ningún cambio funcional permanente. Solo observabilidad temporal.
"@ | Set-Content docs/2026-03-24-paddle-auth-transaction-debug.md