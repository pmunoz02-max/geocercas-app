# Fix invite tracker membership owner fallback

Fecha: 2026-07-07  
Branch: preview  
Archivo principal: supabase/functions/send-tracker-invite-brevo/index.ts

## Problema

La pantalla Invitar Tracker mostraba:

- Plan: ENTERPRISE
- Estado: ACTIVE
- Usados: 0 / 9999
- Cupo disponible

Pero al enviar la invitación la Edge Function respondía:

membership_required

El endpoint /api/invite-tracker ya validaba billing y cupo, pero la Edge Function send-tracker-invite-brevo hacía una segunda validación de autorización usando únicamente:

- memberships
- org_members

Si el usuario dueño/creador de la organización no tenía una fila sincronizada en esas tablas, la función rechazaba la invitación aunque la organización estuviera activa.

## Solución

Se amplió ensureMembership con un fallback seguro:

1. Busca membership activa/no revocada en memberships.
2. Busca membership activa en org_members.
3. Si no existe en esas tablas, consulta organizations.
4. Permite continuar si organizations.owner_id o organizations.created_by coincide con el userId autenticado.
5. En ese caso devuelve una membership sintética con role owner.

## Regla permanente

La Edge Function debe validar que quien invita pertenece o administra la organización.

Fuentes válidas:

- memberships
- org_members
- organizations.owner_id
- organizations.created_by

No se debe permitir invitación si el usuario autenticado no coincide con ninguna fuente válida.

## Alcance

No se modificó:

- Flujo de email Brevo.
- Creación de tracker_invites.
- accept-tracker-invite.
- Tablas de Supabase.
- Producción.
