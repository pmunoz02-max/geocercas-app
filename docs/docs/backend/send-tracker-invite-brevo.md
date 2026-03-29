send-tracker-invite-brevo.md
# send-tracker-invite-brevo

## Fecha
2026-03-29

## Branch
preview

## Motivo del cambio
Se limpió y reconstruyó la función `send-tracker-invite-brevo` porque el archivo anterior quedó mezclado/corrupto dentro del handler, provocando fallos de ejecución y diagnóstico inconsistente.

## Cambios aplicados
- Se dejó únicamente código seguro fuera del handler:
  - imports
  - constantes
  - helpers puros
- Se agregó log global:
  - `🔥 send-tracker-invite-brevo loaded`
- Se agregó log al inicio del handler:
  - `🔥 handler start`
- Se movió la inicialización sensible dentro de `serve(...)`:
  - variables de entorno
  - cliente Supabase
- Se eliminó código duplicado o incrustado por error dentro del handler.
- Se normalizó el flujo de errores con `try/catch` principal.
- Se mantuvo el envío de invitación aunque falle el lookup opcional de assignment.
- Se mantuvo retorno de `action_link` como fallback si Brevo falla.
- Se dejó respuesta JSON consistente con `build_tag`.

## Diagnóstico esperado
Después del deploy, los logs permiten distinguir:

### Caso A
No aparece:
`🔥 send-tracker-invite-brevo loaded`

Posible causa:
- error de import
- fallo al cargar el módulo

### Caso B
Aparece `loaded` pero no aparece:
`🔥 handler start`

Posible causa:
- crash antes de entrar al request handler

### Caso C
Aparecen ambos logs

Posible causa:
- el problema ya está dentro del flujo interno del handler

## Resultado esperado
La función debe:
- aceptar `POST`
- validar owner de la organización
- generar magic link
- intentar enviar por Brevo
- devolver fallback manual si Brevo falla
- no romperse por assignment opcional