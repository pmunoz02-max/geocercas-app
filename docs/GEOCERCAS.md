# Sistema de Geocercas

Permite definir zonas geográficas para control de actividad.

## Tecnología

- Leaflet
- Leaflet-Geoman

## Flujo

```
Usuario dibuja polígono
  ↓
se guarda en tabla geofences
  ↓
se activa o desactiva
```

## Usos

- control de presencia
- asignaciones
- análisis territorial

## API y acceso

La ruta `/geocerca` utiliza la capa `geofencesApi` para todas las operaciones de lectura y escritura.

> La UI no accede directamente a la tabla `geofences`, sino que siempre pasa por la API (`geofencesApi`). Esto permite aplicar reglas de negocio, validaciones y control de acceso centralizado.