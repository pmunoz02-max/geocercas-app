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
