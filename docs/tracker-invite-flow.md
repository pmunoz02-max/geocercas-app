
## [2026-04-08] Cambio crítico: invitación tracker sin JWT

- El link de invitación ya **no** contiene un JWT ni access_token de usuario.
- Ahora se genera un **token opaco aleatorio** (32 bytes, base64url) para cada invitación.
- Solo el hash SHA-256 del token se guarda en la base de datos (`invite_token_hash`).
- El link enviado por email incluye únicamente el token opaco como `inviteToken` o `t`.
- El frontend (TrackerGpsPage) llama a `/api/accept-tracker-invite` con el token y org_id.
- El backend valida el token contra el hash, expiración y estado activo en `tracker_invites`.
- Si es válido, el backend responde con los datos y credenciales del tracker correctos.
- El frontend solo inicia sesión de tracking si la validación es exitosa.
- **Nunca** se expone un JWT ni access_token real en el link de invitación.

Este flujo elimina riesgos de seguridad y asegura que solo el destinatario pueda activar la sesión tracker.
