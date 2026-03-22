# Paddle Preview Alignment

## Contexto

Se realizó una alineación del flujo de billing en preview para usar Paddle en lugar de Stripe.

## Cambios realizados

- Edge Function `paddle-create-checkout` ahora:
  - Usa SUPABASE_SERVICE_ROLE_KEY
  - Es null-safe respecto a user
  - No bloquea por JWT inválido en preview
- Frontend:
  - UpgradeToProButton usa JWT real vía getAccessToken
  - Eliminados renders duplicados del botón
  - UI simplificada en /billing
- Supabase:
  - Se alineó preview para usar un único project ref:
    wpaixkvokdkudymgjoua
  - Se corrigieron mismatches entre clientes Supabase
- Guards:
  - supabaseClient ya no rompe la app con throw fatal
  - ahora reporta mismatch vía console.error y window.__SUPABASE_PREVIEW_MISMATCH__

## Impacto

- Se elimina error 401 por mismatch de proyecto
- Se habilita flujo completo de Paddle checkout en preview
- Se mantiene aislamiento de producción

## Notas

- Solo aplica a branch preview
- No afecta producción
- Stripe permanece deshabilitado en UI
