# RPC de aceptación transaccional — Preview

Estado actual 2026-09-09: RPC aplicada y Edge Function versión 160 desplegada en Preview. La ruta Vercel delega en esa función y adapta la sesión para Android. Los apartados históricos conservan el registro de cada validación y sus límites.

## Contrato

public.accept_tracker_invite_transactional(p_org_id uuid, p_invite_token text, p_expected_user_id uuid DEFAULT NULL) → jsonb.

Entradas: token original, no su hash; org invitante esperada; UUID opcional ya resuelto por backend, que se comprueba contra Auth. No se admite un rol de entrada. Posesión del token es la credencial del enlace; el backend no debe registrar sus argumentos. No se crea usuario Auth, no se envía correo y no se emite JWT.

Éxito: ok, already_accepted, invite_id, org_id, tracker_user_id, accepted_at. Son datos de aceptación, no una sesión ni una garantía de acceso futuro. Al integrar el endpoint, comprobar autorización vigente antes de emitir sesión y diseñar su idempotencia aparte.

Rechazos de negocio: SQLSTATE P0001 con códigos estables (invite_not_found, invite_inactive, invite_expired, invite_ambiguous, invite_role_mismatch, invite_identity_unavailable/mismatch/ambiguous, tracker_user_id_not_resolved, inviting_org_owner_protected, plan_unavailable, plan_inactive, tracker_limit_reached, invite_already_used_or_inconsistent, accepted_membership_not_active_tracker). Entrada inválida: invalid_invite_input. Aislamiento no soportado: 25001. Fallos de constraint, trigger y otros errores de infraestructura se propagan y revierten la operación; el futuro endpoint no debe exponer detalles internos al cliente.

## Flujo y bloqueo

READ COMMITTED; organizaciones FOR NO KEY UPDATE, invitación FOR UPDATE, identidad Auth FOR SHARE, billing/plan FOR SHARE, membresía FOR UPDATE. Identidad por email normalizado único de la invitación; discrepancias con email o personal vinculado se rechazan. No busca un tracker por org ni llama a ensure_tracker_membership. La organización bloqueada proviene del parámetro y la invitación debe coincidir con ella y el hash SHA-256 del token.

FREE permite estado free/active, demás planes active con los alias ya usados por el hook. Cupo efectivo de org_entitlements sin fallback, overrides 0/1 preservados. Los límites no se hardcodean. El owner de la invitante se rechaza; admin de esa org pasa a tracker. No se cambian roles globales ni filas de otras organizaciones.

Nueva aceptación: crea/reactiva memberships y marca accepted_at/used_at/used_by_user_id en la misma transacción. Los bridges existentes propagan org_members y app_user_roles. Un tracker ya activo no se reescribe ni consume otro cupo. Si el estado proyectado de una membresía ya activa estuviera desalineado, este borrador no lo repara; requiere diagnóstico separado.

Reintentos válidos: misma identidad y registro de aceptación completo, membresía todavía tracker activa, invitación activa/no expirada y plan/cupo vigente. Devuelve la fecha original sin escribir. No reactiva revocaciones, no consume otro cupo y no permite apropiarse de invitaciones usadas. Para evitar reutilización ilimitada del enlace, este contrato rechaza también reintentos expirados; no ofrece consulta histórica del resultado. La invitación permanece is_active=true como el flujo actual, y el estado accepted/used controla la idempotencia.

No se captura un error después de escribir para convertirlo en éxito. Cualquier excepción revierte membresía, proyecciones y marca de aceptación. La transacción externa debe terminar pronto; no mantenerla abierta durante envíos o firma JWT. Escritores que usan orden distinto de bloqueos aún pueden generar 40P01: reintentar toda la transacción, no partes. Vías directas a org_members y pairing aún pendientes no quedan corregidas por crear esta RPC.

## Acceso y compatibilidad

SECURITY DEFINER, search_path explícito, objetos persistentes calificados; EXECUTE revocado a PUBLIC/anon/authenticated y concedido únicamente a service_role (además del propietario administrativo de la función). No usar auth.uid como identidad automática: service_role puede carecer de usuario. Antes de aplicar se deben validar ACL efectivas con las pruebas incluidas. La función es nueva, no reemplaza sobrecargas existentes.

SHA-256 nativo de PostgreSQL 17; no añade extensiones. Referencias: https://www.postgresql.org/docs/17/functions-binarystring.html y https://supabase.com/docs/guides/database/functions.

## Archivos y validación

Migración: supabase/migrations/20260909151648_accept_tracker_invite_transactional_preview.sql.
Pruebas: tests/sql/accept-tracker-invite-preview/transactional.sql, session-a.sql, session-b.sql y README.md.

Revisión estática únicamente. No se ejecutó SQL, migración, test de BD, push ni deploy. Siguiente paso: revisar el diff y luego autorizar aplicación y pruebas en Preview; solo después integrar el endpoint.

## Aplicación y resultados reales — 2026-09-09

Aplicada tras autorización explícita únicamente a mujwsfhkocsuuahlrssn. Versión remota 20260909151648; archivo local alineado con ese historial. La descripción de borrador anterior corresponde al diseño previo.

transactional.sql: resultado passed. La primera ejecución detectó el índice tracker_invites_one_active_per_org_email_ux; se corrigió solo el helper de fixtures para desactivar la invitación anterior antes de crear otra para el mismo correo. Se ajustaron los tokens usados en las aserciones de revocación/expiración; no se cambió la RPC. La segunda ejecución pasó y revirtió todos sus datos y el trigger temporal de fallo inyectado.

Concurrencia real con procesos CLI y observador independiente:
- Último cupo: B (PID 2755681) bloqueada por A (2755678), espera 10,161448 s. Una invitación aceptada y otra pendiente.
- Dos reintentos simultáneos de la misma invitación ya aceptada: B (2755701) bloqueada por A (2755698), espera 10,254561 s; already_accepted=true y un solo tracker. Fecha original preservada en A; la suite transaccional verifica también su estabilidad en el reintento.
- Reversión de A: se descartó una primera ejecución sin orden de inicio garantizado. En la repetición sincronizada se observó B (2755751) bloqueada por A (2755745). A revirtió; B esperó 20,264042 s y aceptó. Estado final comprobado: solo la invitación y membresía de B quedaron aceptadas/activas.

Limpieza confirmada: cero usuarios, organizaciones, invitaciones, memberships, org_members, app_user_roles y billing correspondientes a los fixtures; cero triggers test_only_fail_accept_write. No se enviaron correos ni se generaron JWT.

Evidencia: tests/sql/accept-tracker-invite-preview/concurrency-evidence.json. Las pruebas respaldan estos escenarios concretos; no prueban todavía el endpoint ni todas las vías de escritura. Endpoint sin modificar, sin push ni deploy de aplicación, producción intacta.
## Integración local del endpoint — 2026-09-09

Con autorización explícita, accept-tracker-invite/index.ts usa ahora una única llamada a accept_tracker_invite_transactional. Envía org_id y token original; p_expected_user_id=null, sin confiar en un user_id recibido del navegador. La RPC resuelve la identidad. Se eliminan del endpoint la resolución por organización, ensure_tracker_membership y la escritura separada de aceptación. Se conserva handleAcceptTrackerInvite exportado y serve(handleAcceptTrackerInvite).

El endpoint valida la forma del resultado, obtiene el correo de Auth por el UUID devuelto y comprueba que memberships mantiene ese usuario como tracker activo en la organización antes de emitir sesión. JWT_SECRET se valida antes de aceptar. La respuesta añade already_accepted. Los rechazos de negocio se traducen a HTTP explícitos; errores SQL desconocidos no exponen detalles. Deadlock, serialización y bloqueo temporal devuelven 503 acceptance_retry_required.

La firma JWT y las sesiones runtime permanecen fuera de la transacción de aceptación. Si fallan después de aceptar, el cliente puede reintentar: la RPC revalida y devuelve la aceptación existente sin duplicar cupos. Esto no convierte la emisión de sesiones concurrentes en una operación idempotente ni elimina cambios de autorización posteriores a la comprobación.

Suite src/test/accept-tracker-invite.preview.test.js: 29 pruebas con mocks aprobadas en Node. Incluye identidad no resuelta sin fallback por org, errores de plan/cupo, respuesta RPC inválida, identidad canónica, membresía revocada, sanitización de errores y reintento tras fallo de firma. Mocks de Supabase y JWT: no usa datos reales, correos ni sesiones reales. El entorno Node se fija solo en este archivo para evitar el bloqueo observado al cargar esta suite backend con jsdom.

La integración está preparada localmente en branch preview. No se ha desplegado el endpoint, ni hecho push; estas pruebas no constituyen una verificación del endpoint remoto.

## Despliegue autorizado en Preview — 2026-09-09

Se desplegó únicamente accept-tracker-invite en mujwsfhkocsuuahlrssn mediante CLI con proyecto explícito. Versión remota 160, estado ACTIVE, verify_jwt=true conservado. La lectura del código publicado confirma accept-tracker-invite-v4_preview_20260909 y la llamada accept_tracker_invite_transactional.

Comprobación remota sin datos: OPTIONS devolvió 200/ok; POST sin credenciales devolvió 401 UNAUTHORIZED_NO_AUTH_HEADER. Esto verifica disponibilidad y protección del gateway, no una aceptación completa con identidad y sesión. Las 29 pruebas locales con mocks siguen siendo la evidencia del handler. No se aceptaron invitaciones reales durante esta comprobación. Sin push a Git ni cambios en producción.

## Verificación remota de aceptación y recuperación — 2026-09-09

Prueba autorizada en versión 160, proyecto Preview, con dos usuarios sintéticos example.invalid y organización temporal FREE con override 1. La primera petición aceptó en la RPC pero devolvió 503 accepted_identity_unavailable: el fixture Auth insertado solo con id/email estaba incompleto para la API Auth. Se completaron exclusivamente sus campos de fixture; no se modificó código ni configuración.

Dos reintentos posteriores devolvieron HTTP 200, ok=true, already_accepted=true, UUID destinatario correcto y session.access_token presente (no registrado). Se separaron dos segundos: no se probó emisión de sesiones simultánea ni reintento dentro del mismo segundo. La evidencia de BD fue accepted=1, trackers=1, org_members tracker=1, app_user_roles tracker=1 y active_sessions=1. Esto verifica recuperación tras fallo posterior al commit, sin duplicar cupo, y emisión real de sesión; no verifica una primera respuesta already_accepted=false ni la validez del JWT contra el servicio GPS.

Se eliminaron sesiones, invitaciones, membresías, organización y usuarios temporales. Consulta final confirmó cero filas de los fixtures en auth.users, organizations, memberships, org_members, app_user_roles, org_billing, tracker_invites y tracker_runtime_sessions. No se enviaron correos. Sin nuevo deploy, push ni cambios en producción.

## Sesión de aceptación reconocida por GPS Preview — 2026-09-09

Tras autorización explícita para enviar el token temporal a https://preview.tugeocercas.com/api/send-position, se creó un fixture Auth completo y una invitación nueva. La aceptación devolvió ok=true, already_accepted=false y sesión presente. El token se mantuvo en memoria y no se imprimió.

GPS devolvió 400 invalid_coordinates al enviar un cuerpo vacío y 200 {ok:true,stored:false,reason:no_active_geofence_assignment} con lat/lng 0 y un org_id distinto e inexistente en el cuerpo. La organización temporal no tenía asignaciones. BD confirmó active_trackers=1, active_sessions=1, session_used=1 y positions=0. Esto acredita reconocimiento del token y el rechazo de almacenamiento sin asignación; no prueba almacenamiento dentro de geocerca ni aislamiento completo entre dos organizaciones con asignaciones. La inspección local muestra que la identidad y organización se toman de la sesión.

Limpieza final: cero filas de fixture en auth.users, organizations, memberships, org_members, app_user_roles, org_billing, tracker_invites, tracker_runtime_sessions y tracker_positions. Sin correos, cambios funcionales, push ni nuevo deploy. Producción intacta.

## Guardado GPS dentro/fuera de geocerca — 2026-09-09

Prueba remota autorizada exclusivamente en Preview con usuarios Auth completos, organización FREE/override 1, personal, actividad, geofence y asignación temporales. Metadatos, constraints y triggers inspeccionados antes de crear fixtures. Geocerca poligonal pequeña centrada en 0,0 y radio 100 m; asignación activa con ventana temporal de una hora antes/después.

Aceptación: ok=true, already_accepted=false, sesión emitida. POST a https://preview.tugeocercas.com/api/send-position: punto 0,0 devolvió 200 {ok:true}; punto 1,1 devolvió 200 {ok:true,stored:false,reason:outside_assigned_geofence}. Consulta directa confirmó una sola posición, lat/lng 0,0, usuario temporal correcto y org_id de la sesión, aunque el cuerpo del punto interior enviaba otro UUID de organización inexistente. No se imprimieron tokens.

Se eliminaron los fixtures y se verificaron cero filas en auth.users, organizations, memberships, org_members, app_user_roles, org_billing, tracker_invites, tracker_runtime_sessions, tracker_positions, personal, activities, geofences y asignaciones. Sin correos, cambios funcionales, push ni nuevo deploy; producción intacta. Esta prueba cubre aceptación, sesión y guardado/rechazo por geocerca vía HTTP, no la captura GPS en un dispositivo Android físico.

## Ruta web de aceptación pendiente de publicar — 2026-09-09

La captura móvil mostró que TrackerInviteStart usa /api/accept-tracker-invite en Vercel, no directamente la Edge Function que se había probado. Esa ruta mantenía un guard plan_status=active y escrituras legacy independientes. Las pruebas HTTP anteriores validaban Supabase directamente y GPS, no este puente web.

Corrección local: la ruta resuelve la invitación por hash, rechaza organización discrepante y delega a accept-tracker-invite de Supabase con credencial backend. No transmite user_id proporcionado por el cliente. Conserva claim_pairing_code y adapta session.access_token a tracker_runtime_token y los alias que ya consume Android. Plan, identidad, cupo y membresía quedan en la aceptación transaccional desplegada. Se eliminó el log del prefijo del token de invitación.

Validación local: 7 pruebas nuevas del puente más 29 de la Edge Function, total 36 aprobadas. Comprueban identidad canónica, formato de sesión, org discrepante, errores de plan/cupo/identidad y reintento. Sin llamadas reales ni correos. Pendiente de commit/push de la ruta Vercel. El bloqueo independiente de TrackerDashboard para FREE requiere confirmar la regla comercial antes de modificarlo.

## Panel FREE y publicación de la ruta web

Autorizado habilitar el panel también para FREE. TrackerDashboard utiliza el permiso validado de useOrgEntitlements (misma condición de plan e identidad de organización que canInviteTrackers, sin depender del consumo actual). FREE con límite positivo y estado free/active puede cargar posiciones, geocercas y asignaciones; errores, carga pendiente, org desalineada, cupo configurado cero y planes inactivos siguen bloqueados. La interfaz ya no afirma que se exige PRO. Traducciones ES/EN/FR alineadas.

Validación previa a publicación: 50 pruebas aprobadas (proxy web 7, Edge Function 29, hook 4, pantalla de invitación 10). Build Vite correcto en 14,32 s. No se atribuye a esas pruebas cobertura visual del mapa ni una prueba Android física. Commit y push autorizados únicamente a preview; no se vuelven a ejecutar migraciones ni se despliega producción.