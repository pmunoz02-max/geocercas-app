# Retiro de plan_limits legacy — Preview

Fecha: 2026-07-14

Entorno: Supabase Preview únicamente.

## Objetivo

Retirar `public.plan_limits` después de migrar la fuente operativa de límites a `public.plans`.

## Arquitectura vigente

```text
org_billing.plan_code
    ↓
plans
    ↓
org_entitlements
    ↓
funciones y triggers