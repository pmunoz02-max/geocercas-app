---

## Estado actual (2026-05-01)

- Asignaciones operativas: la lógica de asignación y sincronización está activa y funcional.
- `tracker_assignments` es un espejo runtime de las asignaciones activas, actualizado automáticamente por el backend.
- `tracker_positions` es la fuente de datos para el dashboard y reportes de posiciones.
- El endpoint `invite-tracker` bloquea la invitación si `personal.user_id` es null (no permite invitar sin usuario enlazado).

arquitectura vigente
servicio válido: ForegroundLocationService
entry point: WebViewActivity
deep link válido: /tracker-accept
carpeta _deprecated no usar para implementar