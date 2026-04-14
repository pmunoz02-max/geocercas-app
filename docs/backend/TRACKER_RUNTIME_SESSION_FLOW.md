# Tracker Runtime Session Flow (Final Fix)

## Problema previo

El flujo de invitación estaba devolviendo el `invite_token` como:

- tracker_runtime_token ❌

Esto causaba:

- ERROR invalid_token en /api/send-position
- tracker nunca aparecía como activo
- desalineación entre invite, runtime y tracking

## Solución implementada

Se introduce un flujo correcto de runtime:

1. accept-tracker-invite:
   - valida invite
   - resuelve tracker_user_id desde personal.user_id
   - crea registro en tracker_runtime_sessions
   - genera token aleatorio (runtime token)
   - guarda hash del token
   - devuelve token plano al cliente

2. send-position:
   - recibe Bearer token
   - calcula hash
   - valida contra tracker_runtime_sessions
   - verifica assignment activa
   - inserta posición
   - actualiza tracker_latest
   - actualiza tracker_health

## Resultado esperado

- tracker válido aparece como ACTIVE
- dashboard refleja estado real
- desaparece invalid_token
- flujo tipo Uber funcional

## Nota

Los invites previos al fix no deben reutilizarse.
Siempre generar uno nuevo.