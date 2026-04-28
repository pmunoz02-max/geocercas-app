# invite-tracker

## Descripción
El endpoint `/api/invite-tracker` valida plan y delega el envío de invitaciones a la Edge Function `send-tracker-invite-brevo`.

## Deep Link
El flujo utiliza deep link nativo:

geocercas://tracker?token=RUNTIME_TOKEN&org_id=ORG_ID

## Nota
El link final enviado al usuario se genera en la Edge Function, no en este endpoint.