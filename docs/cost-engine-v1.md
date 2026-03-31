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