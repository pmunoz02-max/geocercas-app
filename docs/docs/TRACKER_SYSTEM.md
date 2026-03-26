# Sistema de Tracker

El tracker registra posiciones GPS en tiempo real.

## Flujo

```
Dispositivo móvil
  ↓
envía lat/lng
  ↓
API Supabase
  ↓
tabla tracker_positions
```

## Datos registrados

- user_id
- lat
- lng
- timestamp

## Visualización

**Dashboard:**
- mapa en tiempo real
- clustering
- filtros por usuario

## Consideraciones

- optimizar consultas
- limitar frecuencia de posiciones
- evitar crecimiento excesivo de tabla