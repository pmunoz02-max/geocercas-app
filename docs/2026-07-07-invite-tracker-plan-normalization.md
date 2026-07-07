# Fix invite tracker plan normalization

Fecha: 2026-07-07  
Branch: preview  
Archivo principal: api/invite-tracker.js

## Problema

En la pantalla Invitar Tracker, el frontend mostraba:

- Plan: ENTERPRISE
- Estado: ACTIVE
- Usados: 0 / 9999
- Cupo disponible

Pero al enviar la invitación el backend respondía:

membership_required

El frontend ya normalizaba plan_code y plan_status, pero el endpoint api/invite-tracker.js validaba plan_status y consultaba plan_limits sin normalizar los valores recibidos desde org_billing.

Esto podía causar bloqueos cuando org_billing contenía valores como ENTERPRISE o ACTIVE en mayúsculas.

## Solución

En api/invite-tracker.js se normalizaron:

- plan_status
- plan_code

Ambos se convierten a lowercase antes de validar el plan activo y consultar plan_limits.

Además, se agregó fallback defensivo de límites por plan:

- free: 1
- starter: 1
- pro: 10
- enterprise: 9999
- elite: 9999
- elite_plus: 9999

## Regla permanente

Para validar invitaciones de trackers:

- El backend debe normalizar plan_code y plan_status antes de comparar.
- Enterprise activo debe permitir invitaciones mientras exista cupo.
- La UI y el endpoint /api/invite-tracker deben usar reglas equivalentes.
- No bloquear invitaciones por diferencias de mayúsculas/minúsculas en billing.

## Alcance

No se modificó:

- api/accept-tracker-invite.js
- Edge Function send-tracker-invite-brevo
- tablas de Supabase
- lógica de DODO
