---

# Fuente viva: Flujo Invite Tracker (2026)

Este documento es la referencia actual y viva del flujo de invitación y tracking de usuarios tipo tracker. Toda la lógica y reglas aquí descritas reflejan el estado vigente del backend y frontend. **Todos los documentos previos sobre este flujo deben considerarse históricos.**

## Entidades y tablas clave

- **users_public**: Registro público y canónico de usuarios, sincronizado desde `auth.users` y `personal` al aceptar o activar un tracker. El campo `role` debe ser `tracker` para usuarios de tracking.
- **personal.user_id**: Identidad canónica del tracker. Si es null, no se permite invitar ni sincronizar asignaciones.
- **asignaciones**: Fuente operativa de asignaciones visuales y de negocio. Solo se consideran activas si hay un `personal.user_id` válido.
- **tracker_assignments**: Espejo runtime de asignaciones activas, sincronizado automáticamente tras enlazar `personal.user_id` y mediante el procedimiento `bootstrap_tracker_assignment_current_user`.
- **tracker_positions**: Única fuente canónica de posiciones para dashboard y reportes. El dashboard solo debe consultar esta tabla, usando `personal.user_id` o `tracker_assignments.tracker_user_id` como clave.

## Reglas y flujo principal

1. **Invitación**: Se genera solo si existe un registro en `personal` con `user_id` no nulo.
2. **users_public**: Se asegura/sincroniza automáticamente al aceptar la invitación o enlazar el usuario.
3. **Asignaciones**: Se crean en la tabla `asignaciones` y solo se reflejan en `tracker_assignments` si hay `user_id` válido.
4. **tracker_assignments**: Se sincroniza automáticamente tras enlazar `personal.user_id` y es idempotente.
5. **tracker_positions**: Todas las posiciones enviadas por el tracker se insertan aquí y son la fuente para el dashboard.

## Notas y advertencias

- Si `personal.user_id` es null, la invitación y la integración tracker quedan bloqueadas hasta resolver la identidad.
- El endpoint `invite-tracker` bloquea la invitación si no hay `user_id`.
- El dashboard y los endpoints nunca deben usar `owner_id` ni `userId` del query/body para asociar posiciones o asignaciones.
- Todos los documentos previos sobre el flujo de invitación tracker, asignaciones y posiciones deben considerarse **históricos** y no deben usarse como referencia.

## Onboarding para usuarios nuevos sin organización

- Los usuarios recién creados que aún no tienen organización **deben ver un onboarding claro** (pantalla /inicio o mensaje de espera), nunca una pantalla blanca ni un error genérico.
- Debe indicarse explícitamente que falta aceptar invitación de tracker o que el administrador debe asignar una organización/rol.
- El flujo correcto es: login exitoso → mensaje de bienvenida/espera → usuario espera invitación o asignación de rol.
- Nunca dejar al usuario sin feedback visual o con la app bloqueada sin explicación.

### Botón para instalar app de tracking
- El nombre del package Android **debe obtenerse siempre** de la variable de entorno `VITE_ANDROID_PACKAGE_NAME`.
- Nunca debe hardcodearse el package antiguo ni ningún valor fijo en el frontend o backend.

- En este estado, la pantalla muestra un botón visible que lleva a `/tracker-install` para instalar o abrir la app de tracking GPS.
- En `/tracker-install`, el botón "Instalar desde Google Play" solo se muestra si existe la variable de entorno `VITE_ANDROID_PLAY_URL`.
- Mientras no exista `VITE_ANDROID_PLAY_URL`, **no** debe mostrarse ningún enlace ni botón que apunte a la antigua página de Google Play ni a enlaces externos obsoletos.
- El objetivo es facilitar la instalación directa o apertura de la app de tracking oficial desde el flujo de onboarding, evitando confusión con versiones antiguas o no autorizadas.

---

## Sin membresía: NO_ORG_CONTEXT y espera de invitación

Desde 2026-05, el endpoint `/api/auth/ensure-context` **ya no crea organización automática** para usuarios autenticados sin ninguna membresía. En vez de bootstrap automático:

- Devuelve HTTP 200 con `{ ok: false, code: "NO_ORG_CONTEXT", data: ... }`.
- El frontend debe mostrar pantalla de espera de invitación (onboarding para testers: cuenta creada, espera invitación o abre el enlace recibido).
- Solo si el usuario ya tiene al menos una membresía, se resuelve contexto normal y se expone la organización activa.

Esto evita crear organizaciones basura y permite flujos de onboarding controlados para testers y usuarios invitados.

---

## Histórico

- Docs antiguos sobre invite-tracker, asignaciones, tracker_assignments y tracker_positions quedan obsoletos a partir de este documento.

---

## Validación cerrada — Invite Tracker / GeoField GPS

Fecha: 2026-05-09

El flujo de invitación y activación de trackers quedó validado de extremo a extremo.

Flujo oficial validado:

1. Owner/Admin envía invitación a tracker desde la plataforma.
2. El tracker recibe email o link de invitación.
3. El link oficial abre `/tracker-accept?inviteToken=...&org_id=...`.
4. El backend valida la invitación y genera runtime token.
5. El tracker entra a `/tracker-gps`.
6. GeoField GPS envía posiciones correctamente.

Resultado validado:

`Owner/Admin → invitar tracker → email/link → /tracker-accept → runtime token → /tracker-gps → posiciones activas`

Reglas vigentes:

- `/tracker-accept` es el único flujo soportado para onboarding y activación de seguimiento.
- `/tracker-open` queda solo como redirect legacy para compatibilidad con enlaces antiguos.
- `/tracker-open` no debe usarse directamente ni enlazarse en emails, deep links nuevos ni apps.
- Cualquier email, deep link o fallback web nuevo debe apuntar a `/tracker-accept`.
- Package Android oficial: `com.fenice.geofieldgps`.
- Installer válido para pruebas productivas: `com.android.vending`.
- App Links validado: `app.tugeocercas.com: verified`.
- SHA-256 Google Play App Signing:
  `6B:CF:82:23:06:62:28:20:51:11:0E:72:26:1A:21:D5:37:CF:92:EB:F5:74:AE:A5:D2:76:71:6C:A8:FC:55:D2`
- No validar App Links productivos con instalaciones sideload (`installer=null`).
- No agregar SHA locales/sideload a `assetlinks.json` productivo.
