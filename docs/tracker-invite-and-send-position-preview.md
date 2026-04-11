# Canonical Tracker Invite & Send-Position Flow (Preview)

## Resumen

- El usuario invita a un tracker desde el panel.
- El tracker acepta la invitación.
- El backend crea una sesión en `tracker_runtime_sessions`:
  - Genera un `tracker_access_token` (opaco o JWT).
  - Guarda solo el hash del token, junto con `org_id`, `tracker_user_id`, `expires_at`, `active=true`.
- El cliente (Android/WebView) almacena el `tracker_access_token` y lo usa para autenticarse.
- Cada vez que el tracker reporta posición:
  - Envía POST a `/api/send-position` con `Authorization: Bearer <tracker_access_token>` y el payload de posición.
  - El backend valida el hash del token contra `tracker_runtime_sessions`.
  - Si es válido y tiene asignación activa, persiste la posición en `positions` y actualiza el estado en `tracker_latest`.
- El dashboard y los sistemas realtime consumen los datos de `tracker_latest`.

## Reglas clave

- **Prohibido depender de owner session o sesión web para el tracking runtime.**
- **Prohibido usar magic link como flujo canónico para trackers.**
- El único flujo canónico es: invite → runtime session → tracker_access_token → envío directo a `/api/send-position`.

---

Última actualización: 2026-04-11