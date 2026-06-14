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
