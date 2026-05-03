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

arquitectura vigente
servicio válido: ForegroundLocationService
entry point: WebViewActivity
deep link válido: /tracker-accept
carpeta _deprecated no usar para implementar