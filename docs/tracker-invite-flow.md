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

## Tracker Session Bootstrap

The `accept-tracker-invite` endpoint now returns a real Supabase session object containing `access_token` and `refresh_token` for the resolved tracker user. The frontend must call `supabase.auth.setSession` with these tokens immediately after a successful invite acceptance. This enables the tracker to operate with a real authenticated session, allowing autonomous position reporting, persistent authentication across restarts, and full RLS enforcement on the backend. This step is required for secure, production-grade tracking flows.

**Example response:**

```
{
  "ok": true,
  "tracker_user_id": "...",
  "org_id": "...",
  "email": "...",
  "session": {
    "access_token": "...",
    "refresh_token": "...",
    "token_type": "bearer"
  }
}
```

**Frontend integration:**

```
await supabase.auth.setSession({
  access_token: result.session.access_token,
  refresh_token: result.session.refresh_token,
});
```

After this, the tracker can send positions and access protected resources as a real user.
