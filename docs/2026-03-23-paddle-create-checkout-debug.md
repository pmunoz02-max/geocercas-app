# 2026-03-23 — paddle-create-checkout debug

## Branch
preview

## Cambio
Se corrigió un error de sintaxis en `supabase/functions/paddle-create-checkout/index.ts` que impedía el deploy de la Edge Function.

## Contexto
El flujo de upgrade a plan PRO estaba fallando en `paddle-create-checkout`.

Evolución del diagnóstico:
1. Con JWT verify ON, la función respondía `401 Unauthorized`.
2. Se desactivó verify JWT en preview para aislar el problema.
3. La respuesta cambió de `401` a `500`, confirmando que la función ya estaba ejecutándose.
4. Durante la instrumentación para logs internos se introdujo un error de sintaxis.
5. Se reparó la sintaxis para permitir nuevamente el deploy y continuar el diagnóstico interno.

## Alcance
Solo preview.
No producción.

## Siguiente paso
Redeploy de `paddle-create-checkout` en preview y validar logs internos:
- FUNCTION HIT
- get_user_result
- request_body
- env_check
- unhandled_error