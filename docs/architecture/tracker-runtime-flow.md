# Canonical Tracker Runtime Flow (Preview)

> **This is the single canonical reference for tracker runtime architecture in preview.**
> All other docs are obsolete if they conflict with this model.

---

## Resumen del flujo canónico

1. El owner invita a un tracker desde el dashboard.
2. El tracker acepta la invitación.
3. El backend resuelve la identidad del tracker invitado.
4. El backend crea una sesión runtime en `tracker_runtime_sessions`:
   - Genera un **tracker runtime token opaco** (no es un JWT).
   - Guarda solo el hash del token opaco, junto con `org_id`, `tracker_user_id`, `expires_at`, `active=true`.
5. El cliente (Android/WebView) almacena y usa el **tracker runtime token opaco** para autenticarse.
6. Cada vez que el tracker reporta posición:
   - Envía POST a `/api/send-position` con `Authorization: Bearer <tracker runtime token opaco>` y el payload de posición.
   - El backend valida el hash del token contra `tracker_runtime_sessions`.
   - Si es válido y tiene asignación activa, persiste la posición en `positions` y actualiza el estado en `tracker_latest`.
7. El dashboard y los sistemas realtime consumen los datos de `tracker_latest`.

---

## Source of Truth
- **runtime auth:** `tracker_runtime_sessions`
- **tracker identity:** `tracker_runtime_sessions.tracker_user_id`
- **live dashboard:** `tracker_latest`
- **canonical history:** `positions`

---

## Reglas clave y prohibiciones
- **Prohibido depender de owner session o sesión web para el tracking runtime.**
- **Prohibido usar magic link como flujo canónico para trackers.**
- **Prohibido resolver identidad desde tracker_invites en cada envío.**
- **Prohibido fallback a auth_token legacy o cookies web.**
- **Prohibido mezclar arquitecturas duales de autenticación runtime.**
- **El único flujo canónico es:** invite → runtime session → tracker runtime token opaco → envío directo a `/api/send-position`.

---

## Detalles técnicos

### tracker_runtime_sessions
- Solo almacena el hash del token opaco de runtime
- Campos recomendados: `org_id`, `tracker_user_id`, `access_token_hash`, `active`, `issued_at`, `expires_at`, `last_seen_at`, `revoked_at`

### send-position
- Lee `Authorization: Bearer <tracker runtime token opaco>`
- Hashea el token recibido
- Resuelve sesión en `tracker_runtime_sessions` usando el hash
- Valida asignación activa en `tracker_assignments`
- Inserta en `positions` y actualiza `tracker_latest`

### Android/WebView
- Solo usa el **tracker runtime token opaco** para tracking
- No depende de owner session, auth_token legacy ni cookies
- El reemplazo de token debe ser explícito si cambia la identidad

### Dashboard/Realtime
- Consume solo de `tracker_latest` para estado en vivo
- Friendly names deben venir de fuentes de identidad (`org_people`, `profiles`), no de `tracker_latest`

---

## Pipeline canónico

`tracker_assignments → positions → tracker_geofence_events → tracker_latest`

---

## Migración y cambios futuros
- Todo cambio debe probarse solo en preview
- No mezclar preview y producción
- Actualizar este doc antes de cualquier commit
- Mantener una sola fuente de verdad para runtime

---

## Estado

Este documento es la referencia activa para el comportamiento runtime de trackers en preview.
Cualquier doc anterior que contradiga este modelo debe archivarse o marcarse como obsoleto.

---

Última actualización: 2026-04-11