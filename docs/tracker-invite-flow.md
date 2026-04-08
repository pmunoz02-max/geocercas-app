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

## Tracker Session Bootstrap (Updated)

The `accept-tracker-invite` endpoint now returns a `session` object containing `access_token` and `refresh_token` for the resolved tracker user. The `TrackerGpsPage` must call `supabase.auth.setSession` (or `supabaseTrackerClient.auth.setSession`) immediately after a successful invite acceptance, using these tokens. This step is required to enable authenticated, autonomous tracking and to ensure all backend RLS and security policies are enforced for the tracker user.

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
if (result.session?.access_token && result.session?.refresh_token) {
  await supabase.auth.setSession({
    access_token: result.session.access_token,
    refresh_token: result.session.refresh_token,
  });
}
```

After this, the tracker can send positions and access protected resources as a real user, and the session will persist across app restarts.
## 🔥 Custom JWT Tracker Session (Nuevo)

El endpoint `accept-tracker-invite` ahora emite un `access_token` JWT personalizado firmado con `SUPABASE_JWT_SECRET`.

### Flujo

1. Frontend llama `accept-tracker-invite`
2. Backend:
   - valida invite token
   - resuelve `tracker_user_id`
   - genera JWT:
     - `sub = tracker_user_id`
     - `role = authenticated`
   - devuelve `session.access_token`
3. Frontend:
   - ejecuta `supabase.auth.setSession({ access_token })`
   - establece `trackerSessionReady = true`

### Características

- No usa email ni OTP
- No requiere interacción del usuario
- Permite tracking autónomo en Android
- Diseñado para servicios tipo Uber

### Nota

Este JWT no incluye `refresh_token`.  
La renovación debe manejarse re-ejecutando el bootstrap si expira.
## Token tracing debug

For tracker invite debugging, log invite_id, invite token hash, final invite URL, and compare frontend inviteToken vs t before accept-tracker-invite.