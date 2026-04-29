# invite-tracker

## DescripciÃ³n
El endpoint `/api/invite-tracker` valida plan y delega el envÃ­o de invitaciones a la Edge Function `send-tracker-invite-brevo`.


## Link de invitaciÃ³n (OBLIGATORIO)

https://app.tugeocercas.com/tracker-open?token=RUNTIME_TOKEN&org_id=ORG_ID&userId=USER_ID

## Flujo real

Email â†’ tracker-open â†’ tracker-gps â†’ Android.startTracking

## Comportamiento

- Si la app estÃ¡ instalada:
	â†’ abre WebView â†’ ejecuta startTracking

- Si la app NO estÃ¡ instalada:
	â†’ redirige a /tracker-install

## Nota

- NO usar geocercas://tracker como link principal
- NO usar preview domain para invitaciones
- El deep link nativo se usa solo como fallback interno
## Tracker Invite Flow V2 — runtime session public accept fix

Estado: en preview, pendiente validación final con HTTP 200.

Cambio backend aplicado:
- api/accept-tracker-invite.js ahora debe permitir activación pública desde /tracker-open.
- El invite token puede llegar por Authorization Bearer, body, query o x-invite-token.
- El invite token NO debe enviarse a Android como token de tracking.
- El endpoint debe crear un runtime token opaco, guardar sha256(runtimeToken) en tracker_runtime_sessions.access_token_hash y devolver tracker_runtime_token.
- /api/send-position debe recibir ese runtime token y resolver hasSession=true.

Validación esperada:
- [api/accept-tracker-invite] runtime session created
- [api/send-position] proxy_payload ... hasSession: true
- [api/send-position] proxy_end ... status: 200

No cerrar este flujo ni generar AAB hasta confirmar envío real de posición.
