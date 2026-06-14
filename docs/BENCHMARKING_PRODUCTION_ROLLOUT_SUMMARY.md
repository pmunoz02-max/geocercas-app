# Benchmarking Production Rollout Summary

Date: 2026-06-14

## Result

`/benchmarking` is live in Production after Preview validation and Production database preparation.

## Database

Created in Supabase Production:

```sql
public.v_benchmarking_efficiency_preview
```

Validation:

```text
rows_count: 23
rows_with_area: 23
rows_with_horas_m2: 23
rows_with_costo_m2: 23
rows_with_tracking_hours: 0
rows_with_planned_hours: 23
```

## Frontend

Validated in Production:

- Navigation next to Planificación
- KPIs
- Filters
- Bar chart
- Line chart
- CSV export
- Auxiliary metrics: `horas/ha`, `$/ha`, `horas/km²`, `$/km²`

## Current limitation

Tracking by assignment is not active yet because `tracker_positions.asignacion_id` is not populated. The module labels the current hour source as `PLANIFICADA`.

## Rules preserved

- No push to `main`
- No demo data in Production
- No Preview/Production data mixing
- Promote performed only after explicit order
