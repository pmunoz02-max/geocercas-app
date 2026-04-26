# Skill: Tracker GPS

## Objetivo
Mantener estable el flujo completo de tracking GPS de GeocercasApp:

invite → aceptación → auth tracker → envío GPS → backend → base de datos → dashboard/reporte.

Este documento debe actualizarse cada vez que se corrija un bug o se cambie arquitectura relacionada con trackers.

---

## Reglas operativas

- Trabajar solo en branch `preview`.
- No hacer push a `main`.
- No mezclar preview con producción.
- No subir lógica demo a producción.
- Después de cada cambio importante:
  1. build local
  2. commit
  3. push
  4. probar deployment preview en Vercel

---

## Flujo correcto del tracker

1. Admin crea invitación para tracker.
2. Tracker acepta invitación.
3. Tracker queda asociado a la organización que lo invitó.
4. Aunque el usuario tenga otro rol en otra organización, dentro de la org invitante debe entrar como `tracker`.
5. Tracker inicia sesión.
6. Tracker envía ubicación desde `/tracker-gps`.
7. Frontend llama a `/api/send-position`.
8. Vercel proxy reenvía a Supabase Edge Function `send_position`.
9. Edge Function valida usuario/org.
10. Inserta posición en tabla de tracking.
11. Dashboard muestra última posición y recorrido.

---

## Regla crítica de roles

Cuando una persona acepta una invitación como tracker:

- Debe ingresar como `tracker` en la organización que lo invita.
- No importa si en otra organización es admin, owner u otro rol.
- El rol debe resolverse por combinación:

```txt
user_id + org_id
Fuente de verdad de identidad

La relación estable debe mantenerse así:

auth.users.id
        ↓
personal.owner_id
personal.user_id
        ↓
tracker_positions.user_id

Regla permanente:

personal.user_id debe existir y estar sincronizado con personal.owner_id

No resolver bugs de trackers con parches manuales por usuario.
Si hay inconsistencia, corregir la arquitectura/fuente de verdad.

Endpoint de envío GPS

Frontend tracker:

/api/send-position

No llamar Supabase directamente desde el frontend para insertar posiciones.

El endpoint /api/send-position actúa como proxy Vercel hacia Supabase Edge Function.

Logs esperados en Vercel:

[api/send-position] proxy_start
[api/send-position] proxy_end
Supabase Edge Function

Función principal:

send_position

Responsabilidades:

Validar token/auth.
Resolver tracker.
Resolver organización activa.
Validar que el tracker pertenece a la organización.
Insertar posición.
Retornar respuesta estable al frontend.

No debe depender de datos visuales del frontend.

Invitaciones tracker

Tabla esperada:

tracker_invites

Reglas:

No asumir columnas sin verificar.
Antes de modificar SQL o backend relacionado a invites, revisar estructura real de tabla.
No usar columnas inexistentes como:
token si el sistema usa invite_token_hash
updated_at si solo existe created_at

Si se necesita modificar lógica de invites, primero pedir/ejecutar SQL de inspección de estructura.

SQL de inspección antes de tocar tablas

Antes de alterar lógica sobre tracker_invites, personal, organizations, memberships o posiciones:

select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'tracker_invites',
    'personal',
    'organizations',
    'organization_members',
    'tracker_positions',
    'positions'
  )
order by table_name, ordinal_position;

No ejecutar migraciones nuevas sin confirmar estructura actual.

Reglas de frontend tracker

Archivo típico:

src/pages/TrackerGpsPage.jsx

Reglas:

No mostrar datos técnicos al usuario final.
No mostrar tokens, user_id, org_id ni debug blocks.
Mantener botón de tracking claro y visible.
Si el botón está deshabilitado, debe haber razón visible para usuario.
No dejar pantalla en blanco.
Debe existir loader/error/retry cuando aplique.
Android / TWA / WebView

El tracker Android debe:

Usar permisos de ubicación requeridos.
Mantener foreground service para tracking persistente.
Enviar posiciones al backend, no solo al WebView.
Evitar pantalla blanca.
Mostrar loader, error o retry si la web no carga.
Reglas para bugs

Cuando se corrija un bug de tracker, actualizar este archivo con:

Síntoma
Causa raíz
Solución permanente
Archivos tocados
Cómo probarlo

Formato:

## Bugfix YYYY-MM-DD - nombre corto

### Síntoma
...

### Causa raíz
...

### Solución permanente
...

### Archivos modificados
- ...

### Prueba obligatoria
- ...
Pruebas obligatorias después de cambios
Preview

Validar:

Login tracker funciona.
Invitación tracker se acepta correctamente.
Tracker entra con rol tracker en la org invitante.
Botón de iniciar tracking está activo cuando corresponde.
/api/send-position responde OK.
Vercel logs muestran proxy_start/proxy_end.
Supabase recibe inserts.
Dashboard actualiza posición.
No hay datos debug visibles.
Producción

Solo revisar producción si se hizo Promote explícito desde deployment preview aprobado.

No conectar preview con Supabase producción salvo instrucción clara.
Push / deploy corto

Después de validar local:

git status
git add docs/skills/tracker.md
git commit -m "docs: add tracker skill [allow-docs]"
git push origin preview
Regla Copilot

Cuando se use Copilot para tracker:

Abrir archivo específico.
Prompt corto.
Un cambio por paso.
Probar.
Push a preview.

Ejemplo:

Archivo abierto: src/pages/TrackerGpsPage.jsx

Prompt Copilot:
Mantén la lógica intacta. Solo mejora el estado disabled del botón mostrando una razón visible para el usuario.
No hacer
No arreglar trackers con SQL manual por usuario.
No asumir columnas.
No mezclar preview con producción.
No recalcular lógica crítica en frontend.
No mostrar tokens ni debug en UI.
No cambiar auth, roles o tracking en el mismo commit sin documentar.

Push corto:

```bash
git checkout preview
git status
git add docs/skills/tracker.md
git commit -m "docs: add tracker skill [allow-docs]"
git push origin preview
```

---

## Bugfix: TrackerDashboard blank screen (preview)

- **Fecha:** 2026-04-25
- **Síntoma:** Pantalla en blanco al cargar el dashboard de trackers.
- **Causa:** Uso de `allowedAssignmentUserIds` sin definir y filtrado inseguro de `latestRows` cuando no hay asignaciones. Además, el select de `tracker_latest` pedía columnas inexistentes.
- **Solución:**
  - Definir siempre `allowedAssignmentUserIds` como `Set` seguro, aunque no haya asignaciones.
  - Solo filtrar `latestRows` si hay asignaciones.
  - El select de `tracker_latest` debe pedir solo columnas reales: `user_id,org_id,lat,lng,accuracy,ts,created_at`.
- **Notas:**
  - Solo afecta branch preview.
  - No se modificó auth ni routing.

---

## Bugfix: Límite de trackers al aceptar invitación (2026-04-26)

- **Síntoma:** No se podía aceptar invitación de tracker en organizaciones activas sin registro en tabla de planes o suscripciones (org_billing), por límite 0.
- **Causa:** El límite de trackers se resolvía a 0 si faltaba el registro de plan, bloqueando la aceptación.
- **Solución:**
  - Si no existe registro en org_billing, se consulta el campo `plan` en la tabla `organizations`.
  - Se aplica el siguiente fallback de límites:
    - starter: 1
    - pro: 10
    - business: 50
    - enterprise: 9999
  - Nunca se permite límite 0 para organizaciones activas.
- **Notas:**
  - Aplica solo a branch preview.
  - No afecta organizaciones suspendidas/inactivas.
  ### Fix: tracker_limit_reached = 0

Problema:
La aceptación de invitaciones devolvía límite 0 cuando no existían tablas plans/subscriptions.

Solución:
Se implementa fallback basado en organizations.plan:
- starter: 1
- pro: 10
- business: 50
- enterprise: 9999

Nunca se permite fallback a 0.
### Fix: accept tracker limit crash + fallback

Problema:
- tracker_limit = 0
- crash por doble declaración de trackerLimit

Causa:
- lógica duplicada en accept-tracker-invite
- falta de fallback cuando no existe org_billing

Solución:
- eliminar duplicación de trackerLimit
- resolver límite desde:
  1) org_billing si existe
  2) fallback a organizations.plan

Límites:
- starter: 1
- pro: 10
- business: 50
- enterprise: 9999

Nunca permitir fallback a 0.
### Fix: tracker limit override cero
No se permite tracker_limit_override = 0 o negativo. Solo se usa override si es mayor a 0; si no, se usa fallback por plan: starter 1, pro 10, business 50, enterprise 9999.


### Fix: accept runtime response
Se restauran campos tracker_runtime_token, tracker_user_id, org_id, invite_id.


### Fix: runtime JWT secret
accept-tracker-invite usa TRACKER_RUNTIME_JWT_SECRET con fallback JWT_SECRET para firmar tracker_runtime_token.


### Fix: tracker_latest sin created_at
En producci�n tracker_latest no tiene created_at. El dashboard consulta solo user_id, org_id, lat, lng, accuracy y ts; positions queda como fallback.


### Fix: geofence events table name
Producci�n usa geofence_events, no tracker_geofence_events. Si falla la consulta de eventos, dashboard contin�a sin bloquear.


### Fix: geofence_events schema real
Se elimina personal_id de la consulta. Solo columnas reales. Eventos nunca rompen dashboard (fallback vac�o).

