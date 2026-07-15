# org_entitlements usa el catálogo plans — Preview

Fecha: 2026-07-14

Entorno: Supabase Preview únicamente.

## Objetivo

Eliminar la duplicidad operativa entre `public.plan_limits` y
`public.plans`, haciendo que `public.org_entitlements` obtenga los
límites base desde el catálogo comercial `public.plans`.

## Arquitectura anterior

```text
org_billing.plan_code
    ↓
plan_limits
    ↓
org_entitlements
    ↓
funciones y triggers