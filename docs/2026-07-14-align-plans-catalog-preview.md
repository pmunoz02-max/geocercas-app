# Alineación del catálogo de planes — Preview

Fecha: 2026-07-14

Entorno: Supabase Preview únicamente.

## Objetivo

Alinear `public.plans` con la matriz comercial oficial de GeoField GPS.

## Catálogo oficial

| Código | Nombre | Geocercas | Trackers | Precio mensual USD |
|---|---|---:|---:|---:|
| free | FREE | 1 | 2 | 0 |
| pro | PRO | 25 | 10 | 29 |
| enterprise | Enterprise | 250 | 50 | 99 |

## Alcance

- Se insertan o actualizan únicamente `free`, `pro` y `enterprise`.
- No se eliminan `starter`, `elite` ni `elite_plus`.
- No se modifica el enum `public.plan_code`.
- `public.plan_limits` continúa siendo la fuente operativa de enforcement.
- `public.plans` queda alineada como catálogo comercial.
- No se modifica Producción.
- No se hace push a `main`.

## Migración

```text
supabase/migrations/20260714000200_align_plans_catalog_preview.sql