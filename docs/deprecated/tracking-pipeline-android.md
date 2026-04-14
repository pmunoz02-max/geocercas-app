# Tracking Pipeline – Android (Preview)

## Flujo general
Android (ForegroundLocationService)
→ cola persistente local
→ /api/send-position (Vercel)
→ Supabase Edge Function send_position
→ insert en positions
→ trigger sync_tracker_latest_from_positions
→ tracker_latest

## Resiliencia
- Cola persistente en dispositivo
- Retry con backoff por item
- Deduplicación de posiciones
- No pérdida de datos ante fallo de red

## Estado actual (preview)
- Tracking end-to-end funcional
- Reboot persistence activa
- Protección contra duplicados activa
- Battery optimization handling en progreso