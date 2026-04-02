# Android Health Flags – Tracking

## Fecha
Abril 2026

## Descripción
Se agregan flags desde Android hacia el backend en send_position:

- service_running
- battery_optimization_ignored
- background_restricted
- manufacturer
- sdk_int

## Objetivo
Permitir diagnóstico de tracking en condiciones reales y mejorar tracker_health.

## Impacto
- No rompe API existente
- Campos adicionales opcionales
- Mejora observabilidad

## Fuente
TrackingService.kt (Android native)