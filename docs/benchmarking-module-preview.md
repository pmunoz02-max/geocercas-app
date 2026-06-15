# Benchmarking module — Preview and Production

## Status

The `/benchmarking` module was implemented, validated in Preview, and promoted to Production on 2026-06-14 after Supabase Production was prepared with the required read-only view.

Production route:

```text
/benchmarking
```

Navigation placement:

```text
Planificación / Planning / Planification → Benchmarking
```

The module is part of the protected application layout and is intended for management users. Tracker-only users must not access it.

## Operational rules preserved during rollout

- Work was performed on branch `preview`.
- No push to `main` was required for the rollout.
- Production was touched only after explicit order to promote.
- Production database received only the required read-only view.
- No demo data was inserted into Production.
- Promote to Production was done from the validated Preview deployment.

## Purpose

Benchmarking compares operational efficiency across:

- Assignments
- Geofences
- People / workers
- Activities
- Time periods

The module is decision-support only. It must not automatically approve, reject, penalize, assign, or modify operational work. It only displays evidence for management review.

## Data source

The frontend reads from:

```sql
public.v_benchmarking_efficiency_preview
```

The view is based on:

```text
public.v_costos_hybrid_preview
+ public.geofences.geom / PostGIS area
```

The view is created with `security_invoker = true` and keeps `org_id` in the row set so Supabase/RLS and frontend organization context remain aligned.

## Current evidence limitation

`tracker_positions.asignacion_id` exists, but the current Production data has no assignment-linked tracking rows. Therefore, Benchmarking currently uses planned assignment hours when direct assignment tracking evidence is unavailable.

The UI must clearly show:

```text
Fuente de horas: PLANIFICADA
```

and must not imply that the current values are fully audited by GPS at assignment level.

Future tracker/mobile changes should populate `tracker_positions.asignacion_id`. When that happens, create a more precise tracking-by-assignment layer such as:

```sql
public.v_tracking_assignment_coverage_preview
```

Then update `v_benchmarking_efficiency_preview` to prioritize assignment-linked tracking evidence.

## Canonical units

Canonical backend unit:

```text
area_m2
```

Base efficiency indicators:

```text
horas_m2 = horas_benchmark / area_m2
costo_m2 = costo_final / area_m2
```

The UI also shows derived readable indicators:

```text
horas_ha  = horas_m2 * 10000
costo_ha  = costo_m2 * 10000
horas_km2 = horas_m2 * 1000000
costo_km2 = costo_m2 * 1000000
```

Large `area_m2` values are not automatically considered errors because the app supports agriculture, logistics, transport, industrial yards, urban zones, and other operational sectors.

## Filters

The module supports:

- Geofence
- Person / worker
- Activity
- Date range
- Grouped period: day, week, month, quarter, semester, year
- Compare by: assignment, geofence, person, activity
- Indicator: hours/m² or $/m²
- Chart type: bars or lines

## Outputs

The module displays:

- KPI cards
- Bar chart for group comparison
- Line chart for time evolution
- Comparative table
- CSV export with applied filters and export date
- Traffic-light evidence: green, yellow, red, gray
- Improvement opportunity text

## Chart behavior — group preservation and adaptive Y scale

The visualization block supports two chart modes:

- **Bars:** compares the selected indicator across all visible groups.
- **Lines:** shows time evolution while preserving every compared group as its own series.

The line chart must not collapse all groups into a single average line. When comparing by geofence, person, activity, or assignment, every visible group must remain represented in the line chart and legend.

### Adaptive Y scale

Benchmarking indicators can be extremely small because the canonical unit is `m²`. For example, values such as `0.000000002`, `0.000000045`, `0.000015703`, or `0.000646907` are valid and must not be visually flattened into zero.

The line chart therefore uses adaptive Y-axis behavior:

- It does not always force the Y axis to start at zero.
- It tightens the Y domain when values are small or close together.
- It can use a logarithmic-style visual scale when values differ by several orders of magnitude.
- It shows an explicit scale indicator/badge when adaptive scaling is active.

This is a **visual-only** behavior. It must not change:

- SQL calculations
- `v_benchmarking_efficiency_preview`
- KPI calculations
- table values
- CSV exports
- RLS/security behavior
- organization scoping

The table and CSV remain the numeric source of truth. Charts are an interpretation layer for readability.

## CSV export

The CSV export must include:

- Applied filters
- Export timestamp
- Base columns visible in the table
- `horas_m2`
- `costo_m2`
- `horas_ha`
- `costo_ha`
- `horas_km2`
- `costo_km2`

Exports must remain scoped to the active organization and must not include cross-organization data.

## Production validation

Before Promote, Supabase Production was validated with:

```text
v_benchmarking_efficiency_preview rows: 23
rows_with_area: 23
rows_with_horas_m2: 23
rows_with_costo_m2: 23
rows_with_tracking_hours: 0
rows_with_planned_hours: 23
```

After Promote, Production UI validation confirmed:

- `/benchmarking` loads in Production.
- The module appears next to Planificación.
- Filters work.
- Bars and line charts work.
- Indicator switch between `horas/m²` and `$/m²` works.
- Small decimal indicators do not display as false zeroes.
- CSV export works and includes auxiliary metrics.
- Line chart preserves all visible comparison groups instead of collapsing them into a single average.
- Adaptive Y scale makes very small differences visible without changing underlying values.

## Files touched in frontend rollout

Main file:

```text
src/pages/Benchmarking.jsx
```

Related routing/navigation/i18n files were updated during rollout:

```text
src/App.jsx
src/layouts/ProtectedShell.jsx
src/i18n/es.json
src/i18n/en.json
src/i18n/fr.json
```

## Permanent architecture rule

Do not calculate canonical geofence area in React. Area must come from backend/PostGIS and be exposed through a view or RPC.

Do not query `tracker_positions` directly from the Benchmarking page for normal rendering. Use `v_benchmarking_efficiency_preview` or a documented successor view.
