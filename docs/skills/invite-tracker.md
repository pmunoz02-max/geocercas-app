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