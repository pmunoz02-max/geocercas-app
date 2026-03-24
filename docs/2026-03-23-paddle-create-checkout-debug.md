# 2026-03-23 — paddle-create-checkout debug

## Branch
preview

## Cambio
Se corrigió un error de sintaxis en supabase/functions/paddle-create-checkout/index.ts para permitir el deploy.

## Contexto
paddle-create-checkout pasó de 401 a 500 al desactivar verify JWT en preview, confirmando que la función ya ejecuta y el siguiente paso es diagnosticar el error interno.

## Alcance
Solo preview.
No producción.

## Siguiente paso
Redeploy de paddle-create-checkout en preview y revisión de logs internos.
