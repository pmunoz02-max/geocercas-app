# Cost Engine v1 – Unified Metrics

## Context
This update consolidates all cost-related metrics into a single source of truth:

public.calculate_tracker_costs_preview

## Objective
Ensure full consistency between:
- Reports (/reports)
- Dashboard (/dashboard-costs)

## Metrics Defined

The following metrics are now computed exclusively in the backend:

- km_observados
- horas_observadas
- porcentaje_cobertura
- nivel_confianza
- costo_total
- hourly_rate
- km_rate

## Key Changes

### 1. Single Source of Truth
All cost calculations are now performed in:
public.calculate_tracker_costs_preview

No frontend calculations allowed.

### 2. Real Data Usage
- Distance: computed from positions (Haversine)
- Time: based on valid GPS segments
- Coverage: horas_observadas / expected_hours
- Rates: pulled from activities table

### 3. Gap Handling
- Segments classified as valid or gap
- Gaps excluded from cost calculations
- Used for coverage and confidence

### 4. Cost Formula

costo_total =
(horas_observadas * hourly_rate) +
(km_observados * km_rate)

### 5. Coverage Definition

porcentaje_cobertura =
horas_observadas / expected_hours

### 6. Confidence Levels

- ALTO ≥ 0.85
- MEDIO ≥ 0.60
- BAJO < 0.60
- INSUFICIENTE: < 2 data points

## Important Rules

- No duplicated logic in frontend
- No alternative calculations in API
- No rounding inconsistencies
- Same function used everywhere

## Status

✅ Backend unified  
✅ Reports aligned  
⏳ Dashboard pending alignment
## Producción — Vistas de costo híbrido habilitadas

Se habilitaron en Supabase Producción las vistas necesarias para que el módulo `/planificacion` pueda comparar planificación operativa con datos reales de asignaciones, costos y evidencia de tracking.

### Vistas creadas

* `v_costos_detalle`
* `v_tracking_coverage_preview`
* `v_costos_hybrid_preview`

### Flujo lógico

1. `v_costos_detalle` toma asignaciones cerradas o con `start_time` y `end_time`, calcula horas y costo base usando `activities.hourly_rate`.
2. `v_tracking_coverage_preview` toma posiciones reales desde `tracker_positions` y calcula cobertura diaria.
3. `v_costos_hybrid_preview` combina costo base con cobertura para producir costo final y estado de auditoría.

### Estados de auditoría

* `NO_AUDITABLE`: no hay fecha de cobertura asociada.
* `SIN_EVIDENCIA`: hay menos de dos puntos de tracking.
* `AUDITADO_ALTO`: cobertura igual o superior a 85%.
* `AUDITADO_MEDIO`: cobertura igual o superior a 60% e inferior a 85%.
* `AUDITADO_BAJO`: cobertura inferior a 60%.

### Factores de cobertura

* Cobertura >= 85%: factor `1.00`
* Cobertura >= 60%: factor `0.80`
* Cobertura < 60%: factor `0.50`
* Menos de 2 puntos: factor `0`

### Validación en Producción

Después de la migración, `v_costos_hybrid_preview` devolvió 23 filas en Producción, confirmando que la vista queda conectada con datos reales.

## Benchmarking efficiency view — Production

El módulo `/benchmarking` reutiliza la capa de costos híbridos para comparar eficiencia operativa por área.

Vista usada:

```sql
public.v_benchmarking_efficiency_preview
```

Base de cálculo:

```text
v_costos_hybrid_preview + geofences.geom/PostGIS area
```

Indicadores canónicos:

```text
horas_m2 = horas_benchmark / area_m2
costo_m2 = costo_final / area_m2
```

Indicadores auxiliares calculables en UI/CSV:

```text
horas_ha  = horas_m2 * 10000
costo_ha  = costo_m2 * 10000
horas_km2 = horas_m2 * 1000000
costo_km2 = costo_m2 * 1000000
```

Reglas:

- `costo_final` sigue viniendo de la capa SQL de costos híbridos.
- `area_m2` debe venir de PostGIS/backend.
- El frontend no debe recalcular área canónica.
- La página puede calcular diferencias contra promedio visible y oportunidades de mejora como agregados de presentación.
- Benchmarking no escribe costos ni modifica asignaciones.

Validación Producción 2026-06-14:

```text
v_benchmarking_efficiency_preview rows: 23
rows_with_area: 23
rows_with_horas_m2: 23
rows_with_costo_m2: 23
rows_with_tracking_hours: 0
rows_with_planned_hours: 23
```
