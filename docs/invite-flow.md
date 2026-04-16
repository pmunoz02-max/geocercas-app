# Invite Flow - Tracker (Fallback Fix)

## Contexto

Se detectó un problema donde invites válidas fallaban con:

- "Invite inactive"
- "accept_failed"

Esto ocurría cuando el usuario utilizaba un link antiguo, ya que el sistema genera múltiples invites y desactiva las anteriores.

## Problema

El backend validaba estrictamente:

- invite_token_hash exacto
- is_active = true

Esto rompía el flujo si el usuario abría un link anterior (muy común en mobile / WhatsApp / email).

## Solución aplicada

Se agregó fallback automático:

- Si la invite encontrada por token está inactiva
- Se busca la última invite activa para el mismo:
  - email_norm
  - org_id

Si existe → se usa esa invite
Si no → se mantiene error original

## Impacto

- Mejora UX (links viejos siguen funcionando)
- Reduce fricción en onboarding
- No afecta seguridad (se mantiene org + email match)

## Pendiente futuro

- Evitar generación de múltiples invites simultáneas
- Reutilizar invite activa existente