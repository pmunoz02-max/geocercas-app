# Tracker Invite Flow (Preview)

## Regla
Los links de invitación del tracker deben ser HTTPS puros.
No usar intent://, android-app:// ni #Intent en links compartidos.

## Formato esperado
/tracker-gps?inviteToken=...&t=...&org_id=...&lang=...

## Backend
Supabase function:
- send-tracker-invite-brevo
Genera inviteUrl y lo envía por email.

## Frontend
TrackerInviteStart.jsx no debe reescribir la URL a intent://.
Debe abrir o redirigir usando la URL HTTPS original.

## Motivo
intent:// rompe el flujo en WebView/TWA y produce ERR_UNKNOWN_URL_SCHEME.