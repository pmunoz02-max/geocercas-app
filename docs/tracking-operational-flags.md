# Tracking Operational Flags – Arquitectura

## Fecha
Abril 2026

## Objetivo
Incorporar estado operativo real del tracker (tipo Uber) en el pipeline de tracking.

---

## Flujo de datos

Android (TrackingService)
→ /api/send-position
→ Supabase Edge Function (send_position)
→ positions (histórico)
→ tracker_latest (estado vivo)
→ trigger incremental
→ tracker_health (cache para dashboard)
→ dashboard UI

---

## Campos operativos

Se agregan a `tracker_latest`:

- permissions_ok (boolean)
- battery_optimized (boolean)
- background_allowed (boolean)
- service_running (boolean)
- source (text)
- battery (integer)
- is_mock (boolean)
- speed (float)
- heading (float)
- device_recorded_at (timestamptz)

---

## Lógica de estado (tracker_health)

La función `refresh_tracker_health_row` ahora calcula:

- pending_permissions → permissions_ok = false
- restricted → background_allowed = false OR service_running = false
- active → < 2 minutos
- stale → < 10 minutos
- offline → > 10 minutos

---

## Separación de responsabilidades

### positions
- histórico de ubicaciones
- no contiene flags operativos complejos

### tracker_latest
- estado vivo del tracker
- última telemetría + flags operativos

### tracker_health
- cache derivada para dashboard
- nunca se escribe directamente

---

## Seguridad

- RLS activo en todas las tablas
- tracker_latest y tracker_health no permiten escritura directa desde cliente
- Edge Function usa service_role para actualización controlada

---

## Beneficios

- tracking resiliente tipo Uber
- estado real del dispositivo (no inferido)
- dashboard confiable
- base lista para monetización (planes por calidad de tracking)

---

## Próximos pasos

- Integrar flags desde Android
- UI: alertas de trackers restringidos
- métricas de calidad de tracking