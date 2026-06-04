# Canonical Tracker Onboarding Flow (Preview)

## Resumen

Este documento describe el flujo canónico de onboarding y tracking de usuarios tipo tracker en App Geocercas / GeoField GPS.

Estado actual:

- El flujo productivo vigente sigue basado en invitación + runtime token.
- El nuevo flujo por código de emparejamiento está validado solo en Preview.
- No promover a Production hasta orden explícita.

## Principio de identidad

El tracker debe tener una identidad mínima autenticada.

En el flujo nuevo, esa identidad se obtiene mediante Magic Link. Magic Link no es el token operativo de tracking; solo identifica al usuario antes de reclamar un código de emparejamiento.

Separación obligatoria:

- Magic Link: identidad/autenticación mínima del usuario.
- Pairing code: empareja organización, persona y tracker autenticado.
- Tracker runtime token: token opaco operativo para enviar posiciones a `/api/send-position`.

## Flujo vigente por invitación

1. El admin invita a un tracker desde el panel.
2. El tracker acepta la invitación.
3. El backend vincula al tracker con la organización correspondiente.
4. El backend crea una sesión en `tracker_runtime_sessions`.
5. Se genera un tracker runtime token opaco.
6. El cliente Android/WebView almacena el runtime token.
7. Cada posición se envía a `/api/send-position` con `Authorization: Bearer <tracker runtime token opaco>`.
8. El backend valida el hash del token contra `tracker_runtime_sessions`.
9. Si el token es válido y existe asignación activa, persiste la posición.
10. Dashboard y reportes consumen posiciones y estado tracker.

## Nuevo flujo Preview: Magic Link + pairing code

Estado: solo Preview.

Flujo objetivo:

1. El admin crea o selecciona una persona trackeada.
2. El admin genera un código de emparejamiento.
3. El tracker abre GeoField GPS.
4. El tracker se autentica con Magic Link.
5. El tracker ingresa el código de emparejamiento.
6. El backend valida el código, organización, persona, expiración y estado.
7. El backend vincula `auth.users.id` con `personal.user_id`.
8. El backend asegura rol tracker en `memberships`, `org_members` y `user_organizations`.
9. El backend genera runtime token en `tracker_runtime_sessions`.
10. El tracker entra a `/tracker-gps` y empieza a enviar posiciones con runtime token.

## Tabla y RPCs Preview

Tabla:

- `tracker_pairing_codes`

RPCs:

- `rpc_create_tracker_pairing_code`
- `rpc_claim_tracker_pairing_code`

Reglas del código:

- El código crudo nunca se almacena en base de datos.
- La base guarda únicamente `code_hash`.
- El código tiene expiración mediante `expires_at`.
- Puede revocarse con `revoked_at`.
- Por defecto es de un solo uso: `max_uses = 1`, `use_count = 0/1`.
- Al consumirse, queda `active = false`.
- El código no autentica al tracker; solo empareja después de Magic Link.

## Reglas clave

- Prohibido depender de owner session o sesión web para el tracking runtime.
- Prohibido usar Magic Link como autenticación runtime para enviar posiciones.
- Prohibido usar el pairing code como identidad principal.
- El runtime operativo siempre debe usar tracker runtime token opaco.
- El token opaco no es JWT.
- En base de datos se guarda solo el hash del runtime token.
- Si una persona acepta invitación o código como tracker, debe quedar con rol tracker en la organización que la invita, sin importar su rol en otras organizaciones.
- No mezclar Preview con Production.
- No subir datos demo a Production.

## Validación Preview

Validado en Supabase Preview con prueba transaccional y `ROLLBACK`:

- `rpc_create_tracker_pairing_code` devuelve `ok = true`.
- `rpc_claim_tracker_pairing_code` devuelve `ok = true`.
- `personal.user_id` queda vinculado al tracker autenticado.
- `memberships.role` queda `tracker`.
- `org_members.role` queda `tracker`.
- `user_organizations.role` queda `TRACKER`.
- Se genera sesión activa en `tracker_runtime_sessions`.
- El código queda consumido: `use_count = 1`, `active = false`.

La prueba terminó con `ROLLBACK`, por lo que no dejó datos temporales ni runtime tokens persistidos.

## Pendiente

- Crear API admin para generar código.
- Crear API tracker para reclamar código.
- Ajustar UI admin para mostrar/copiar código.
- Ajustar UI tracker después de Magic Link para ingresar código.
- Actualizar flujo Android GeoField GPS.
- Validar flujo completo end-to-end en Preview.
- Actualizar `docs/skills/invite-tracker.md` con una referencia corta.
- Actualizar `docs/skills/android.md`.
- Actualizar `docs/README_CURRENT.md`.

---

Última actualización: 2026-06-04
