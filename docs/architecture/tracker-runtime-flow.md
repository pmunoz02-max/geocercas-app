> ⚠️ SUPERSEDED / HISTÓRICO
>
> Este documento queda como referencia histórica.  
> La fuente viva actual del flujo invite/tracker es:
>
> docs/skills/invite-tracker.md
>
> Regla vigente: signaciones = fuente operativa/UI, 	racker_assignments = espejo runtime Android, 	racker_positions = fuente canónica de posiciones dashboard.

---
# Canonical Tracker Runtime Flow (Preview)

> **This is the single canonical reference for tracker runtime architecture in preview.**
> All other docs are obsolete if they conflict with this model.

---

## Resumen del flujo canÃ³nico

1. El owner invita a un tracker desde el dashboard.
2. El tracker acepta la invitaciÃ³n.
3. El backend resuelve la identidad del tracker invitado.
4. El backend crea una sesiÃ³n runtime en `tracker_runtime_sessions`:
   - Genera un **tracker runtime token opaco** (no es un JWT).
   - Guarda solo el hash del token opaco, junto con `org_id`, `tracker_user_id`, `expires_at`, `active=true`.
5. El cliente (Android/WebView) almacena y usa el **tracker runtime token opaco** para autenticarse.
6. Cada vez que el tracker reporta posiciÃ³n:
   - EnvÃ­a POST a `/api/send-position` con `Authorization: Bearer <tracker runtime token opaco>` y el payload de posiciÃ³n.
   - El backend valida el hash del token contra `tracker_runtime_sessions`.
   - Si es vÃ¡lido y tiene asignaciÃ³n activa, persiste la posiciÃ³n en `positions` y actualiza el estado en `tracker_latest`.
7. El dashboard y los sistemas realtime consumen los datos de `tracker_latest`.

---

## Source of Truth
- **runtime auth:** `tracker_runtime_sessions`
- **tracker identity:** `tracker_runtime_sessions.tracker_user_id`
- **live dashboard:** `tracker_latest`
- **canonical history:** `positions`

---

## Reglas clave y prohibiciones
- **Prohibido depender de owner session o sesiÃ³n web para el tracking runtime.**
- **Prohibido usar magic link como flujo canÃ³nico para trackers.**
- **Prohibido resolver identidad desde tracker_invites en cada envÃ­o.**
- **Prohibido fallback a auth_token legacy o cookies web.**
- **Prohibido mezclar arquitecturas duales de autenticaciÃ³n runtime.**
- **El Ãºnico flujo canÃ³nico es:** invite â†’ runtime session â†’ tracker runtime token opaco â†’ envÃ­o directo a `/api/send-position`.

---

## Detalles tÃ©cnicos

### tracker_runtime_sessions
- Solo almacena el hash del token opaco de runtime
- Campos recomendados: `org_id`, `tracker_user_id`, `access_token_hash`, `active`, `issued_at`, `expires_at`, `last_seen_at`, `revoked_at`

### send-position
- Lee `Authorization: Bearer <tracker runtime token opaco>`
- Hashea el token recibido
- Resuelve sesiÃ³n en `tracker_runtime_sessions` usando el hash
- Valida asignaciÃ³n activa en `tracker_assignments`
- Inserta en `positions` y actualiza `tracker_latest`

### Android/WebView
- Solo usa el **tracker runtime token opaco** para tracking
- No depende de owner session, auth_token legacy ni cookies
- El reemplazo de token debe ser explÃ­cito si cambia la identidad

### Dashboard/Realtime
- Consume solo de `tracker_latest` para estado en vivo
- Friendly names deben venir de fuentes de identidad (`org_people`, `profiles`), no de `tracker_latest`

---

## Pipeline canÃ³nico

`tracker_assignments â†’ positions â†’ tracker_geofence_events â†’ tracker_latest`

---

## MigraciÃ³n y cambios futuros
- Todo cambio debe probarse solo en preview
- No mezclar preview y producciÃ³n
- Actualizar este doc antes de cualquier commit
- Mantener una sola fuente de verdad para runtime

---

## Estado

Este documento es la referencia activa para el comportamiento runtime de trackers en preview.
Cualquier doc anterior que contradiga este modelo debe archivarse o marcarse como obsoleto.

---

Ãšltima actualizaciÃ³n: 2026-04-11
