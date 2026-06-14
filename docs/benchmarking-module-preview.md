# Benchmarking module — Preview

## Scope

The `/benchmarking` page compares operational efficiency across assignments, geofences, people, and activities.

This module is management-only and must remain behind the protected layout and organization context. Tracker-only users must not access it.

## Branch and deployment rules

- Work only in branch `preview`.
- Do not push to `main`.
- Do not promote to Production unless explicitly ordered.
- Do not mix Preview and Production data.
- Do not upload demo data to Production.

## Data source

The frontend reads from:

```sql
public.v_benchmarking_efficiency_preview
```

The view is based on `public.v_costos_hybrid_preview` plus canonical geofence area from PostGIS.

Current limitation in Preview: `tracker_positions.asignacion_id` exists but is not populated, so Benchmarking must clearly label the current evidence as `PLANIFICADA` when `horas_observadas` is unavailable.

## Metrics

Base metrics:

- `horas_m2 = horas_benchmark / area_m2`
- `costo_m2 = costo_final / area_m2`

`area_m2` remains the canonical base unit. The UI also displays readable area units:

- m² for small areas
- ha for medium/agricultural areas
- km² for large logistics/transport areas

This avoids assuming that large geofence areas are invalid, because the app supports agriculture, logistics, transport, and other operational sectors.

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

## Decision support rule

Benchmarking does not make automatic decisions. It only shows operational evidence for management review.

## Future improvement

When `tracker_positions.asignacion_id` is populated by the mobile tracker flow, create a more precise tracking-by-assignment layer, for example:

```sql
public.v_tracking_assignment_coverage_preview
```

Then update `v_benchmarking_efficiency_preview` to prioritize assignment-linked tracking evidence.
