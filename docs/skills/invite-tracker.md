# invite-tracker

## Descripción
El endpoint `/api/invite-tracker` valida plan y delega el envío de invitaciones a la Edge Function `send-tracker-invite-brevo`.


## Link de invitación (OBLIGATORIO)

https://app.tugeocercas.com/tracker-open?token=RUNTIME_TOKEN&org_id=ORG_ID&userId=USER_ID

## Flujo real

Email → tracker-open → tracker-gps → Android.startTracking

## Comportamiento

- Si la app está instalada:
	→ abre WebView → ejecuta startTracking

- Si la app NO está instalada:
	→ redirige a /tracker-install

## Nota

- NO usar geocercas://tracker como link principal
- NO usar preview domain para invitaciones
- El deep link nativo se usa solo como fallback interno
## Tracker Invite Flow V2 � runtime session public accept fix

Estado: en preview, pendiente validaci�n final con HTTP 200.

Cambio backend aplicado:
- api/accept-tracker-invite.js ahora debe permitir activaci�n p�blica desde /tracker-open.
- El invite token puede llegar por Authorization Bearer, body, query o x-invite-token.
- El invite token NO debe enviarse a Android como token de tracking.
- El endpoint debe crear un runtime token opaco, guardar sha256(runtimeToken) en tracker_runtime_sessions.access_token_hash y devolver tracker_runtime_token.
- /api/send-position debe recibir ese runtime token y resolver hasSession=true.

Validaci�n esperada:
- [api/accept-tracker-invite] runtime session created
- [api/send-position] proxy_payload ... hasSession: true
- [api/send-position] proxy_end ... status: 200

No cerrar este flujo ni generar AAB hasta confirmar env�o real de posici�n.

Debug temporal preview: send-position registra token_hash_prefix seguro para comparar runtime token Android vs tracker_runtime_sessions.

## Regla de identidad canónica para tracker_user_id

- El endpoint `accept-tracker-invite` resuelve el `tracker_user_id` únicamente desde `personal.user_id` asociado al email y organización de la invitación.
- Nunca se debe usar `owner_id`, ni ningún valor proveniente de `userId` del query o del body como fuente de identidad.
- Si existe un registro en `personal` pero no tiene `user_id`, la invitación falla con error controlado (`tracker_identity_missing`).
- Solo si no existe registro en `personal`, se consideran otros campos explícitos del body o la invitación, pero nunca `owner_id` ni `userId` del query.

Preview update: TrackerDashboard prioriza tracker_positions como fuente can�nica y usa positions/tracker_latest solo como fallback.

## Regla permanente de fuente y asociación (dashboard)

- **tracker_positions** es la única fuente canónica de posiciones para el dashboard.
- **positions** y **tracker_latest** solo se usan como fallback si tracker_positions no tiene datos.
- La asociación de posiciones a trackers debe hacerse únicamente por **personal.user_id** o **tracker_assignments.tracker_user_id**.
- **Nunca** se debe usar **owner_id** para asociar posiciones a trackers en el dashboard ni en ningún endpoint.

## Cierre exitoso del flujo Tracker Invite Android (preview)

Flujo completo validado en entorno preview:

1. **invite**: Usuario recibe invitación por email con link seguro.
2. **tracker-open**: El usuario abre el link, se valida el token y se muestra la pantalla de aceptación.
3. **accept runtime**: El usuario acepta la invitación; el backend crea una sesión runtime y retorna un token opaco.
4. **AndroidBridge**: La app Android recibe el runtime token y lo almacena de forma segura.
5. **ForegroundLocationService**: El servicio inicia el tracking en background y obtiene permisos.
6. **/api/send-position**: La app envía posiciones firmadas con el runtime token; el backend valida la sesión.
7. **tracker_positions**: Las posiciones se insertan en la tabla canónica tracker_positions.
8. **Dashboard actualizado**: El dashboard muestra la última posición del tracker en tiempo real, priorizando tracker_positions.

**Notas:**
- El flujo es exitoso si el dashboard refleja la posición enviada desde Android sin errores y con source=tracker_positions.
- El runtime token nunca se expone en logs ni se reutiliza fuera de la sesión activa.
- El flujo debe ser validado con HTTP 200 en todos los endpoints y visualización en dashboard.

## Bugs corregidos en el flujo Tracker Invite (preview)

- **Invite token usado como runtime:**
  - Antes: El token de invitación se usaba directamente como token de tracking en Android, exponiendo riesgos de seguridad y sesiones inválidas.
  - Ahora: El backend genera un runtime token opaco y solo este se usa para tracking.

- **Cola Android infinita:**
  - Antes: El AndroidBridge podía dejar posiciones encoladas indefinidamente si fallaba la sesión o el envío.
  - Ahora: La cola se limpia correctamente al recibir confirmación o error definitivo, evitando acumulación infinita.

- **Permisos foreground service:**
  - Antes: El servicio de tracking podía iniciar sin permisos completos, causando fallos silenciosos o posiciones perdidas.
  - Ahora: Se valida y solicita correctamente el permiso de foreground service antes de iniciar el tracking.

- **user_id owner vs tracker:**
  - Antes: Se usaba owner_id o userId del query/body como fuente de identidad para el tracker, generando asociaciones incorrectas.
  - Ahora: Solo se usa personal.user_id o assignment.tracker_user_id como fuente canónica.

- **Dashboard priorizando fuente incorrecta:**
  - Antes: El dashboard mostraba posiciones de positions o tracker_latest como principal, ignorando tracker_positions.
  - Ahora: Siempre prioriza tracker_positions y solo usa las otras tablas como fallback.

## Checklist final de validación (Tracker Invite Android)

- [ ] **/api/send-position responde 200** tras envío desde Android.
- [ ] **Insert en tabla tracker_positions** confirmado en la base de datos.
- [ ] **runtime tracker_user_id correcto**: el user_id insertado corresponde a personal.user_id o tracker_assignments.tracker_user_id.
- [ ] **SQL espejo dashboard OK**: la consulta SQL que alimenta el dashboard refleja correctamente los datos de tracker_positions.
- [ ] **Dashboard actualiza H M**: el dashboard muestra la posición en tiempo real (Hora y Minuto) tras el envío desde Android.

## Idempotencia de send-tracker-invite-brevo

- El endpoint es idempotente respecto a invitaciones por `org_id + email_norm`.
- Si existe una invitación activa pendiente (`is_active=true`, `used_at=null`, `accepted_at=null`), la renueva actualizando token, expiración y datos.
- Si existe una invitación activa ya usada o aceptada, la desactiva antes de crear una nueva.
- Si no hay invitación activa, crea una nueva.
- Nunca debe fallar por duplicado normal ni devolver `PENDING_INVITE_NOT_FOUND`.

## Espejo y reglas de asignaciones

- La tabla `asignaciones` es la fuente operativa principal para la gestión de asignaciones visuales y de negocio.
- La tabla `tracker_assignments` es un espejo runtime, sincronizado solo cuando existe un `user_id` válido en la entidad `personal`.
- No se envía invitación de tracker ni se sincroniza a `tracker_assignments` si `personal.user_id` es null; en ese caso, la asignación visual se crea pero la integración tracker queda pendiente hasta que se resuelva la identidad.

---

### Sincronización de asignaciones activas

El procedimiento `bootstrap_tracker_assignment_current_user` se invoca después de resolver y enlazar `personal.user_id` (si era necesario). Esta función sincroniza las asignaciones activas en la tabla `tracker_assignments` para el usuario autenticado y la organización actual, asegurando que el estado sea consistente e idempotente.

- Se llama automáticamente tras enlazar un registro `personal` con el usuario (`user_id`).
- Garantiza que el usuario tenga una asignación activa válida en `tracker_assignments` acorde a su estado de invitación y acceso.
- El procedimiento es seguro para múltiples ejecuciones (idempotente).

- 2026-05-01: bootstrap_tracker_assignment_current_user asegura users_public desde auth.users + personal y sincroniza asignaciones activas hacia tracker_assignments despu�s de resolver personal.user_id.

- 2026-05-01: bootstrap_tracker_assignment_current_user asegura users_public desde auth.users + personal y sincroniza asignaciones activas hacia tracker_assignments despu�s de resolver personal.user_id.
