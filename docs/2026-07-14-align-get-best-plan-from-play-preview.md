# Alineación de get_best_plan_from_play — Preview

Fecha: 2026-07-14

Entorno: Supabase Preview únicamente.

## Objetivo

Alinear la función `public.get_best_plan_from_play(uuid)` con el catálogo oficial de planes.

## Ranking oficial

| Plan | Ranking |
| --- | ---: |
| free | 0 |
| pro | 20 |
| enterprise | 30 |

## Cambios

- Se retiraron del ranking:
  - `starter`
  - `elite`
  - `elite_plus`
- La función ahora valida los productos contra `public.plans`.
- Solo se consideran compras activas y no vencidas.
- La función sigue devolviendo `public.plan_code`.
- No se modificó todavía el enum `public.plan_code`.
- No se modificó Producción.
- No se hizo push a `main`.

## Migración

```text
supabase/migrations/20260714000600_align_get_best_plan_from_play_preview.sql
```
