/docs/tracker-invite-accept-flow.md
2️⃣ Contenido (pegar completo)
# Tracker Invite Flow

## Estado actual

La función legacy `invite-user` queda deprecada y no debe usarse para invitaciones de trackers.

## Flujo válido

Las invitaciones de trackers deben generarse exclusivamente con:

`send-tracker-invite-brevo`

El link enviado debe apuntar a:

`/tracker-accept?inviteToken=...&org_id=...`

Nunca debe usarse Supabase magiclink para trackers.

## Motivo

El flujo con magiclink redirigía a `/tracker-gps` sin `tracker_runtime_token`, causando que el móvil quedara detenido en “Inicializando seguimiento”.

## Regla permanente

Todo tracker invite debe pasar por `/tracker-accept`, generar runtime session y luego continuar a `/tracker-gps`.

# Tracker Invite Acceptance Flow (Idempotent)

## Context
Se implementa aceptación de invitaciones de tracker de forma idempotente y segura, evitando errores en reintentos y asegurando bootstrap correcto del tracking.

## Flujo actualizado

### 1. Envío de invitación
- Edge Function: send-tracker-invite-brevo
- Genera:
  - invite_token (UUID)
  - invite_token_hash (SHA256)
- Se guarda en tracker_invites

### 2. Acceso desde email
- URL:
  /tracker-accept?inviteToken=...&org_id=...
- Página:
  TrackerInviteStart.jsx

### 3. Consentimiento
El usuario debe aceptar el consentimiento antes de continuar.

### 4. Aceptación (API)

Endpoint:

POST /api/accept-tracker-invite
Authorization: Bearer <inviteToken>


### 5. Lógica idempotente

Casos:

#### Invite no existe
→ 404

#### Invite inactivo
→ 409

#### Invite expirado
→ 410

#### Invite ya aceptado
→ 200 (idempotente)
→ retorna runtime existente

#### Primer uso
→ update:
  - accepted_at
  - used_at
→ 200 OK

### 6. Respuesta


{
ok: true,
idempotent: boolean,
tracker_runtime_token,
tracker_user_id,
org_id,
invite_id,
redirectTo
}


### 7. Bootstrap frontend

TrackerInviteStart:

- guarda en localStorage:
  - tracker_runtime_token
  - tracker_user_id
  - tracker_org_id
- redirige a:
  /tracker-gps

### 8. TrackerGpsPage

- NO acepta invites
- SOLO usa runtime existente

## Reglas del sistema

- Aceptación es idempotente
- Backend es source of truth
- Frontend no debe mutar estado crítico
- No depende de estado manual en DB

## Estado actual

✔ Flujo completo funcional  
✔ Aceptación idempotente  
✔ Persistencia básica de runtime  

## Próximos pasos.....

- Runtime token real (no reutilizar invite token)
- Tracker session persistente
- Background tracking Android (foreground service)
- Retry offline / buffer