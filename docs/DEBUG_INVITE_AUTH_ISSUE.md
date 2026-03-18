# DEBUG — Tracker Invite Authorization Issue

## Context

Durante testing en preview se detectó un error:

Error:
"Not allowed (must be owner of org)" en segunda invitación de tracker.

## Diagnóstico

Se confirmó que:
- El owner NO pierde su membership
- El error ocurre porque la request sale autenticada como otro usuario (tracker)
- El callerUserId en la edge function corresponde a un tracker, no al owner

## Causa raíz

Contaminación de sesión en frontend:

- El flujo de invitación tracker usa magic links
- El callback (`AuthCallback.tsx`) ejecutaba:
  - verifyOtp / exchangeCodeForSession / setSession
  - sobre el cliente principal de Supabase
- Esto reemplazaba la sesión del owner en el mismo navegador

## Impacto

- Owner pasa a estar autenticado como tracker
- Pierde permisos de owner
- Segunda invitación falla con 403

## Mitigación aplicada (preview)

1. Logs temporales en:
   - InvitarTracker.jsx
   - send-tracker-invite-brevo

2. Aislamiento de sesión tracker:
   - Uso de cliente Supabase separado (`supabaseTracker`)
   - Evitar bootstrap de cookies en flujo tracker

## Estado

- Fix aplicado en preview
- Pendiente validación completa

## Nota

Este documento existe para cumplir trazabilidad de cambios en archivos críticos según reglas del proyecto.