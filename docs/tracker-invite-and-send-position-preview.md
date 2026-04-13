## Validación estricta de creación de invitación

El endpoint `/api/invite-tracker` debe retornar los campos `invite_id` y `created_at` obtenidos de una fila real recién insertada en la tabla `tracker_invites`. Si no se logra crear la fila o no se obtienen estos valores, la petición debe fallar (HTTP 500) y **no se debe exponer ni utilizar ningún `invite_url`**.

**Requisito de backend:**
- El endpoint `/api/invite-tracker` debe crear siempre una nueva fila en la tabla `tracker_invites` en cada creación exitosa de invitación.
- Debe retornar explícitamente los campos `invite_id`, `created_at` y `invite_url` de esa nueva fila en la respuesta.
**Nota importante:** Las acciones de abrir o copiar el enlace de invitación deben usar únicamente el valor de `invite_url` devuelto por la respuesta más reciente de creación de invitación. Nunca reutilices enlaces previos de estado, caché o almacenamiento local.
---

**Nota de implementación:** El handler de aceptación debe usar una sola variable (por ejemplo, `invite`) para el registro cargado desde la base de datos durante toda la validación. Usar nombres inconsistentes puede causar errores ReferenceError en tiempo de ejecución.
# Canonical Tracker Invite & Send-Position Flow (Preview)


## Resumen

- El usuario invita a un tracker desde el panel.
- El tracker acepta la invitación.
- El backend crea una sesión en `tracker_runtime_sessions`:
  - Genera un **tracker runtime token opaco** (no es un JWT ni está ligado a una sesión de usuario).
  - Guarda solo el hash del token, junto con `org_id`, `tracker_user_id`, `expires_at`, `active=true`.
- El cliente (Android/WebView) almacena el **tracker runtime token opaco** y lo usa como **único mecanismo de autenticación** para el tracker.
- Cada vez que el tracker reporta posición:
  - Envía POST a `/api/send-position` con `Authorization: Bearer <tracker runtime token opaco>` y el payload de posición.
  - El backend valida el hash del token contra `tracker_runtime_sessions`.
  - Si es válido y tiene asignación activa, persiste la posición en `positions` y actualiza el estado en `tracker_latest`.
- El dashboard y los sistemas realtime consumen los datos de `tracker_latest`.


**Importante:** Todo el flujo de tracking se basa en el token opaco de runtime generado en tiempo de ejecución. **No depende de la autenticación del usuario, sesiones web, ni magic links.** El token runtime es el único requisito para que el tracker pueda enviar posiciones.

**Requisito de implementación:** El endpoint `/api/accept-tracker-invite` debe retornar explícitamente `tracker_runtime_token`, `tracker_user_id` y `org_id` en la respuesta exitosa. Estos tres valores deben persistirse (por ejemplo, en localStorage o storage equivalente) antes de redirigir a `/tracker-gps`.



## Reglas clave

**Invitación de tracker:**
- Siempre se debe usar el enlace de invitación (invite link) fresco devuelto por la respuesta de la API `/api/invite-tracker`.
- Está prohibido reutilizar enlaces de invitación previos almacenados en el estado de la UI, caché, o variables antiguas. Cada acción de invitar debe descartar cualquier enlace anterior y utilizar únicamente el enlace recién recibido de la API.


- **El tracking runtime solo usa el `tracker_access_token` generado al aceptar la invitación.**
- **Prohibido depender de sesión de usuario, sesión web, o magic link para el tracking runtime.**
- El único flujo canónico es: invite → runtime session → tracker_access_token → envío directo a `/api/send-position`.

---

Última actualización: 2026-04-11