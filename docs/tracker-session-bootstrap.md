# Tracker Session Bootstrap (Preview)

## Problema
El tracker recibe un inviteToken en la URL pero no tenía sesión activa en Supabase, por lo que send_position fallaba o no enviaba datos.

## Solución
El frontend (TrackerGpsPage.jsx) inicializa sesión usando el inviteToken:

- Se lee inviteToken desde query params o sessionStorage
- Se llama a supabase.auth.setSession()
- Se valida sesión con supabase.auth.getUser()

## Resultado
- trackerSession = true
- El servicio puede enviar posiciones sin requerir nueva invitación
- El flujo es continuo incluso después de sleep

## Nota
Actualmente se reutiliza el access_token como refresh_token temporalmente.
En producción se deberá usar refresh_token real.