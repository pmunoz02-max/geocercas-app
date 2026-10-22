# Corrección de renovación runtime por sesión — Preview, 2026-10-20

## Alcance

La migración `20261020000100_tracker_runtime_renewal_same_session_guard.sql` corrige la selección de sesión en `public.renew_tracker_runtime_session`. El cambio evita asociar el refresh de una sesión a otra sesión del mismo tracker y conserva la compatibilidad con sesiones antiguas sin refresh. El endpoint, el formato de los tokens y el esquema de permisos no cambian.

## Causa del `23505`

La implementación anterior buscaba, en una misma consulta, una fila que cumpliera una de estas condiciones: poseer `p_refresh_hash`, o no tener refresh y coincidir con el access token recibido. Si un refresh pertenecía a una sesión anterior A y el access correspondía a una sesión más reciente B del mismo tracker y organización, ambas podían coincidir. `ORDER BY issued_at DESC LIMIT 1` podía seleccionar B. La renovación intentaba guardar en B el refresh que ya pertenecía a A y el índice único parcial `tracker_runtime_refresh_hash_unique` rechazaba la actualización con SQLSTATE `23505`.

No era un refresh duplicado generado por el cliente: la función podía elegir una fila distinta de la que ya poseía la prueba de renovación.

## Corrección y comportamiento

1. **Selección por refresh:** la función primero busca `p_refresh_hash` globalmente en `tracker_runtime_sessions`, ordena por `issued_at DESC`, toma la fila más reciente y la bloquea con `FOR UPDATE`. Cuando existe un dueño del refresh, esa fila determina la sesión; la función no intenta sustituirla con otra fila que coincida por access.
2. **Validación de identidad:** después de localizar la sesión, compara `org_id` y `tracker_user_id` con los parámetros recibidos. La sesión seleccionada debe además estar activa, no revocada y, si tiene refresh, este debe seguir vigente. Membership tracker activa, estado de plan y entitlement positivo siguen siendo requisitos.
3. **Fallback legacy:** solo si ninguna sesión posee el refresh recibido, busca una sesión de la organización y tracker indicados que no tenga `refresh_token_hash`, coincida con `p_access_hash` y tenga el access vigente. Esta ruta permite que una sesión creada antes del refresh se inscriba durante una renovación válida. No permite elegir una sesión con refresh distinto ni una sesión vencida por access.
4. **Idempotencia por solicitud:** la fila seleccionada queda bloqueada durante la renovación. Si `renewal_request_id` ya coincide con `p_request_id`, la función acepta el retry únicamente si el access almacenado es `p_new_access_hash` y no ha expirado. Así un retry con la prueba anterior, tras perderse la respuesta HTTP, no rota otra vez ni incrementa `token_version`. Si el hash nuevo no coincide o el access expiró, devuelve `request_expired` sin cambiar la fila.
5. **Rotación nueva:** para una solicitud distinta, el access y `renewal_request_id` se actualizan sobre esa misma fila; se conserva el refresh enviado, se extiende su expiración a 30 días, el access a 24 horas y se incrementa `token_version`. El fallback legacy recibe así su primer refresh en la propia fila legacy.

La función continúa siendo `SECURITY DEFINER`, con `search_path` vacío, y solo `service_role` puede ejecutarla. No se cambia la política de membresía, límites ni roles.

## Pruebas SQL transaccionales

El conjunto está en `tests/sql/tracker-runtime-renewal/transactional.sql`. Comienza con `BEGIN` y finaliza con `ROLLBACK`; las organizaciones, usuarios, memberships y sesiones de prueba no se conservan.

Las aserciones cubren:

- renovación y retry con el mismo `request_id`, incluyendo retry tras pérdida de respuesta con el access previo y comprobación de que `token_version` no vuelve a incrementarse;
- rechazo de refresh desconocido sin modificar access, refresh ni versión;
- selección incorrecta entre dos sesiones del mismo usuario: al presentar el access de B con el refresh de A, la llamada debe rechazarse, sin lanzar `23505` ni modificar ninguna sesión;
- rechazo de organización o tracker incorrectos, access nulo, refresh expirado, sesión revocada, membership revocada, plan inactivo o entitlement sin trackers;
- actualización de una sesión legacy sin refresh mediante access vigente, sin alterar la sesión independiente que ya posee el refresh;
- preservación de capacidad y denegación de ejecución de la RPC a `anon` y `authenticated`.

## Diagnóstico interno de rechazos — 2026-10-22

### Migración

`20261022000100_tracker_runtime_renewal_diagnostics_preview.sql` reemplaza `public.renew_tracker_runtime_session` con `CREATE OR REPLACE` y conserva la lógica de la migración `20261020000100`. Solo añade un campo `reason` con un valor fijo a las respuestas `session_not_renewable`. Las validaciones, su orden, el resto de las respuestas (`invalid_request`, `membership_inactive`, `plan_inactive`, `plan_unavailable`, `request_expired` y las exitosas) y los permisos (`REVOKE` a `PUBLIC`, `anon` y `authenticated`; `GRANT` a `service_role`) no cambian. La migración original no se modificó.

### Códigos `reason`

`reason` es interno: sirve para el log del backend y no debe enviarse a clientes.

| `reason` | Condición |
|---|---|
| `refresh_not_found` | Ninguna sesión posee el refresh y el fallback legacy no encuentra una fila elegible |
| `identity_mismatch` | La sesión seleccionada tiene otra organización u otro tracker |
| `access_mismatch_refresh_owner` | El dueño del refresh tiene un access distinto y el `request_id` no coincide |
| `access_mismatch_legacy` | Definido en la RPC para una fila sin refresh con access distinto; no es alcanzable |
| `session_inactive` | `active` es falso |
| `session_revoked` | `revoked_at` no es nulo |
| `refresh_expired` | El refresh está vencido o no tiene fecha de vencimiento |

`access_mismatch_legacy` no puede producirse: el fallback legacy solo selecciona filas cuyo access ya coincide con el recibido. Por eso no tiene prueba ni figura en la lista permitida del endpoint.

Las condiciones de sesión inactiva, revocada y refresh vencido comparten un único rechazo; el valor se elige en este orden: `session_inactive`, `session_revoked`, `refresh_expired`. Una sesión revocada con un access incorrecto se informa como `access_mismatch_refresh_owner`, porque esa comprobación se evalúa antes. El orden de las validaciones no cambió.

### Log `rpc_reason` en Preview

En la rama HTTP 403 de `api/tracker-session-renew.js`, el `previewLog("rpc_rejected", …)` incluye `rpc_error_code` y `rpc_reason`. Ambos se toman de listas permitidas; cualquier valor ausente o inesperado se registra como `unknown`. `rpc_reason` admite los seis valores alcanzables de la tabla anterior. El log solo se emite en entornos Preview y no incluye tokens, hashes ni identificadores de usuario u organización.

La migración ya está aplicada en Supabase Preview, por lo que la RPC de Preview devuelve `reason`. Sin embargo, el endpoint con `rpc_reason` aún no se ha desplegado en Vercel: hasta entonces el despliegue actual no registra `rpc_reason`. En un entorno donde la RPC no tenga la migración, `rpc_reason` se registraría como `unknown`.

### Respuesta pública y Android

El endpoint no cambia sus respuestas. Todo rechazo `session_not_renewable` de la RPC, sin importar su `reason`, sigue produciendo HTTP 403 con `{"ok":false,"error":"session_not_renewable"}`. Android recibe el mismo HTTP 403 y el mismo cuerpo que antes; `reason` no se reenvía.

### Pruebas SQL

Se amplió `tests/sql/tracker-runtime-renewal/transactional.sql` con un bloque que comprueba `error = 'session_not_renewable'` y el valor exacto de `reason` para los seis códigos alcanzables, incluyendo organización y tracker distintos, y refresh vencido o sin fecha. También verifica que una sesión inactiva y revocada informa `session_inactive` y que `membership_inactive` no incluye `reason`. Las pruebas existentes se conservan y el archivo sigue terminando en `ROLLBACK`.

Estado: la migración `20261022000100` se aplicó en Supabase Preview y `transactional.sql` se ejecutó allí correctamente; el resultado fue "Success. No rows returned". Las aserciones no produjeron errores y el `ROLLBACK` final no dejó datos de prueba. Estas pruebas requieren la migración aplicada, porque contra la función anterior fallarían al no devolver `reason`.

Pendiente: desplegar en Vercel el endpoint con `rpc_reason` y verificar el log en Preview. Esta validación no cubre Production, donde no se aplicó la migración.

Para comprobar la migración en Preview, aplicar primero la migración en el entorno aislado correspondiente y ejecutar el SQL transaccional allí. El `ROLLBACK` protege frente a la persistencia de los datos de prueba, pero no sustituye la revisión del destino ni autoriza aplicar cambios en Production.
