---

## Estado actual (2026-05-01)

- Asignaciones operativas: la lógica de asignación y sincronización está activa y funcional.
- `tracker_assignments` es un espejo runtime de las asignaciones activas, actualizado automáticamente por el backend.
- `tracker_positions` es la fuente de datos para el dashboard y reportes de posiciones.
- El endpoint `invite-tracker` bloquea la invitación si `personal.user_id` es null (no permite invitar sin usuario enlazado).

### Nuevos alias de rutas para geocercas (web)

- `/geofences` ahora redirige a `/geocercas`.
- `/new-geofence` y `/nueva-geocerca` ahora redirigen a `/geocerca`.
- Estos cambios aplican solo a la web. No hubo cambios en la base de datos, API ni Android.

### Nuevos alias de rutas de detalle de geocerca (web)

- `/geocercas/:id` y `/geofences/:id` ahora abren la vista VerGeocerca.
- Esto es solo para la web. No afecta la base de datos, API, Android ni producción.

### Actualización de página de geocercas (web)

- Las rutas `/geocercas` y `/geofences` ahora usan la página moderna de mapa Geocercas.jsx.
- GeocercasList.jsx es legacy y no está activa.
- Este cambio es solo para la web; no afecta base de datos, API, Android ni producción.

arquitectura vigente
servicio válido: ForegroundLocationService
entry point: WebViewActivity
deep link válido: /tracker-accept
carpeta _deprecated no usar para implementar

---

## Nota de cierre

El flujo completo de invitación de tracker, onboarding Android GeoField GPS y envío de posiciones quedó validado en producción (`app.tugeocercas.com`) usando Google Play Internal Testing.

## Nota (mayo 2026)

- El listado de geocercas ahora recibe el campo `area_m2`, calculado en el backend/PostGIS mediante la función `list_geofences_with_area_preview`.
- En la interfaz de NuevaGeocerca, se muestra el área de cada geocerca y se permite elegir la unidad de área (m², ha, km² o acres), persistiendo la preferencia del usuario en `localStorage`.
- El área canónica de cada geocerca se calcula exclusivamente en el backend; el frontend solo realiza la conversión y formato para visualización, pero no calcula el área.
- La función `list_geofences_with_area_preview` ahora también devuelve `centroid_lat` y `centroid_lng`, calculados en PostGIS con `ST_PointOnSurface(geom)`. El componente NuevaGeocerca utiliza este punto interno representativo para mostrar Lat/Lng, garantizando que siempre esté dentro del polígono, lo cual es útil incluso para geocercas con linderos irregulares.
