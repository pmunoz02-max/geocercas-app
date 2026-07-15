# Matriz oficial de límites de planes — Preview

Fecha: 2026-07-14

Entorno: Supabase Preview únicamente.

## Objetivo

Definir la matriz oficial de límites para los planes comerciales activos de GeoField GPS.

## Matriz aprobada

| Plan | Máximo de geocercas | Máximo de trackers |
|---|---:|---:|
| Free | 1 | 2 |
| PRO | 25 | 10 |
| Enterprise | 250 | 50 |

## Fuente operativa actual

La tabla `public.plan_limits` continúa siendo la fuente operativa de límites.

La cadena vigente es:

```text
org_billing.plan_code
    ↓
plan_limits
    ↓
org_entitlements
    ↓
funciones y triggers de enforcement