# Piloto hardware: instalación en Preview y pruebas

Estado: instalado permanentemente en Supabase Preview; piloto ficticio creado y verificado. Fecha: 2026-09-27.
Proyecto autorizado: Supabase Preview `mujwsfhkocsuuahlrssn`. Branch `preview`.
No hay dispositivo comprado. No se certifica Teltonika ni se configura ningún IMEI real.

## Archivos y alcance

- `supabase/migrations/20260927174712_hardware_tracker_foundation_preview.sql`: generado inicialmente con Supabase CLI migration new. Añade cuatro tablas y funciones privadas de protección.
- `supabase/verification/hardware_tracker_foundation_preview.sql`: assertions transaccionales con ROLLBACK, para dos organizaciones ficticias preexistentes.
- `supabase/verification/hardware_last_slot_session_a.sql` y `hardware_last_slot_session_b.sql`: guiones interactivos de dos conexiones.

Esta entrega implementa SOLO el esquema propuesto de inventario/configuración, ya instalado en Preview. No incluye ingreso de posiciones, gateway, simulador ejecutable, RPC pública, backfill Android, eventos, borrado programado ni interfaz. La migración y las pruebas sí se ejecutaron en un PostgreSQL local desechable. Después se ejecutó la integración en Supabase Preview dentro de una transacción revertida. Producción no se consultó ni modificó en esta etapa.

## Decisiones aceptadas

- Piloto: 2 trackers habilitados, recorrido completo, 30 días, exclusivamente simulación.
- Fuera del piloto: sin fila de configuración o enabled=false significa hardware deshabilitado; el límite por defecto es 0.
- Un tracker activo consume cupo incluso sin dispositivo o sin comunicación. Desactivarlo libera el cupo y cierra su vinculación abierta. Desactivar solo el dispositivo NO libera el cupo del tracker.
- Reemplazo: cerrar la vinculación anterior y abrir otra en la misma transacción; conserva tracker e historial y no aumenta el cupo.
- No se modifica org_entitlements: el cupo humano y sus overrides 0/1 quedan intactos. El hardware tiene su propia configuración explícita, no facturación automática.
- Los 30 días quedan almacenados como política. NO existe aún almacenamiento/purga de posiciones hardware. No se debe habilitar ingreso real hasta implementar y probar retención efectiva, incluyendo último estado y eventos derivados.
- inside_only queda como opción de configuración futura. No afirmar que ya descarta coordenadas ni genera EXIT: la recepción todavía no existe.

## Contrato de datos

| Tabla | Contrato |
| --- | --- |
| org_hardware_entitlements | Una fila por org, enabled, límite entero >=0, retención 1..365 días (default 30), simulation_only=true. Ninguna org se activa con la migración. |
| trackers | Identidad lógica hardware: UUID, org, nombre, tipo persona/vehículo/equipo, active, is_simulated y modalidad. Sin user_id. No redefine los trackers móviles existentes. |
| tracker_devices | Identificador normalizado, fabricante/modelo/protocolo, org y estado. Identificador único por tipo; IMEI de 15 dígitos es formato, no autenticación ni certificación. Credenciales no incluidas. |
| tracker_device_bindings | Relación de la misma org, período [inicio,fin), una vinculación abierta por tracker y por dispositivo. Tiempos emitidos por el servidor. Sin edición de historia cerrada. |

La organización y la identidad de cada entidad son inmutables. No se permite mover dispositivos entre organizaciones en esta fase; diseñar una transferencia explícita y tratamiento de lotes atrasados antes de permitirlo. El protocolo de un dispositivo registrado también es inmutable; un cambio exige revisar identidad/alta.

No existe endpoint de creación idempotente todavía. Un backend futuro debe reutilizar el mismo UUID de tracker en sus reintentos; el test de ON CONFLICT verifica que repetir la actualización de ese tracker no consume dos cupos. La idempotencia de paquetes se implementará en la fase de recepción.

## Bloqueo y concurrencia

1. Las operaciones usan READ COMMITTED (READ UNCOMMITTED tiene la misma semántica en PostgreSQL). Otros aislamientos se rechazan para evitar conteos con snapshots viejos.
2. Se usa `organizations ... FOR NO KEY UPDATE`, el mismo tipo de bloqueo observado en enforce_membership_limit. Es compatible con los bloqueos KEY SHARE de las FK.
3. La validación de cupo ocurre AFTER INSERT/UPDATE real, incluida la rama elegida por ON CONFLICT. Después del bloqueo se hace otro SELECT en la función VOLATILE, contando los trackers activos visibles más los propios cambios.
4. También se valida al disminuir cupos o deshabilitar la configuración. El límite no puede quedar por debajo de los trackers habilitados. 0 es válido si no quedan activos.
5. Los guards de vinculación/dispositivo toman el mismo bloqueo. Las FK compuestas impiden cruzar organizaciones; los índices únicos resuelven vinculaciones abiertas duplicadas.
6. Para operaciones múltiples, el backend debe bloquear primero todas las organizaciones afectadas por UUID ascendente, antes de modificar filas hijas. Transacciones cortas. Escrituras directas que adquieran filas antes del trigger pueden producir deadlocks; reintentar la transacción completa con los mismos IDs tras 40P01/40001, con límite y espera. Nunca interpretar esos errores como éxito.

El cierre de vínculos usa el reloj del servidor y un CHECK impide fin anterior al inicio. Se rechaza un nuevo vínculo anterior a un período ya cerrado por regresión del reloj. El reemplazo aún requiere transacción backend; no dos llamadas REST independientes.

## Seguridad y despliegue futuro

RLS habilitado. `authenticated` tiene solo SELECT sujeto a has_org_role_active(owner/admin) existente y membresía no revocada; `anon` no tiene acceso. `service_role` puede SELECT/INSERT/UPDATE, sin DELETE/TRUNCATE. Funciones de trigger privadas, search_path vacío, ejecución directa revocada. No se ofrece ninguna RPC SECURITY DEFINER pública ni se usan metadatos de usuario para autorización.

La migración exige un marcador de sesión `geofield.preview_project_ref=mujwsfhkocsuuahlrssn`. No es verificación criptográfica del destino: antes de aplicarla se debe confirmar independientemente el proyecto de la conexión. No ejecutar `db push` indiscriminadamente, pues podría incluir otras migraciones pendientes. Aplicar este archivo de forma atómica solo con autorización expresa y tras pruebas en un entorno aislado compatible. El marcador debe establecerse en la misma transacción/conexión por el operador; el archivo no se lo autoasigna.

No se semilla una organización ni se elige una existente automáticamente. El provisionamiento posterior deberá identificar la org ficticia del piloto y crear su configuración explícita (enabled=true, max_hardware_trackers=2, retention_days=30, simulation_only=true). Sin fila, las FK rechazan alta de trackers/dispositivos.

No hay FK CASCADE para borrar hardware silenciosamente al borrar una organización. Una org enrolada requiere un procedimiento explícito de limpieza/retención antes de eliminarla. No desactivar los guards para operaciones de aplicación.

## Protocolo de pruebas de integración en Supabase

Primero crear o identificar dos organizaciones desechables en Preview con propietarios distintos, sin membresías cruzadas ni datos hardware. La prueba inicial requería fixtures preexistentes; el guion de integración nuevo crea tres identidades ficticias y dos organizaciones dentro de la misma transacción y las revierte. No consulta correos ni filas de personas existentes. Al ejecutar después, pasar sus UUID como org_a y org_b a psql con ON_ERROR_STOP; usar una conexión administrativa de pruebas, nunca una clave de usuario real. El test lee el UUID del propietario ficticio para comprobar RLS sin mostrar correo/nombre. Toda escritura del test principal termina en ROLLBACK; un error exige cerrar/rollback de la conexión.

Cobertura preparada: límite 0, 1, 2; NULL/negativo inválidos; retención inválida; upsert estable; tercero rechazado; reactivación; downgrade; separación de org; dispositivo físico bloqueado en simulación; doble vínculo; reemplazo; historia inmutable; desactivación; cupos de personas sin cambios; RLS de propietario/otra org/anon; grants sin borrado.

Dos conexiones: requiere una configuración ficticia ya confirmada con límite 1 y cero trackers activos, visible para ambas conexiones. No usar la organización activa del piloto ni datos personales.
- A inserta un tracker y queda en pausa sosteniendo el bloqueo.
- B intenta insertar otro UUID en la misma org: debe esperar.
- Escenario rollback (guiones por defecto): A revierte, B termina su INSERT y revierte; no queda ningún tracker de prueba.
- Escenario commit (variante manual): A confirma; B falla con SQLSTATE 23514 y hardware_limit_reached. Debe quedar exactamente un tracker activo. El dato confirmado A requiere limpieza explícita con su UUID exacto, en la org ficticia, antes de eliminar la configuración/fixtures; no usar borrados amplios. No ejecutar esa variante sin autorización para conservar temporalmente datos entre conexiones.
- Repetir tras preparar un tracker inactivo, sustituyendo el INSERT B por su reactivación. Probar también reducción concurrente de cupo, reemplazo y doble vinculación antes de dar por validada la migración.

La concurrencia y revocación de un administrador ficticio no-owner ya se comprobaron en PostgreSQL local con el ejecutor descrito abajo. La integración de una conexión ya pasó contra el esquema real de Supabase Preview con ROLLBACK, según la evidencia siguiente. Las pruebas de dos conexiones se ejecutaron localmente; falta regresión móvil y de endpoints antes de habilitar recepción.

## Reversión

Antes de cualquier aplicación, guardar inventario de objetos y permisos existentes. Para una instalación vacía fallida, revertir la transacción. Si ya hay datos hardware, deshabilitar ingreso y trackers mediante operación controlada; conservar el historial. No ejecutar un down destructivo genérico ni borrar tablas con datos. El frontend/Android actual no depende de estas tablas.

## Fuentes de diseño consultadas

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes

Se revisó el aviso reciente de PostgreSQL. Esta migración no crea índices GiST, operadores personalizados ni cifrado legacy, y no modifica extensiones o índices existentes.

## Primera revisión estática (anterior a la prueba funcional)

- Parser pglast 8.4, instalado solo en directorio temporal, sin conexión a PostgreSQL: sintaxis SQL exterior correcta en los cuatro archivos (39/14/4/4 sentencias). Variables psql sustituidas únicamente en memoria del analizador.
- Parse procedural correcto para lock_org y el helper de assertions. El parser produjo un error de serialización JSON al devolver los árboles de funciones trigger; no se considera validación procedural completa.
- Esa revisión inicial no ejecutó SQL. Fue seguida por la prueba funcional local documentada a continuación; la limitación del parser ya no es el único resultado disponible.


## Validación funcional local completada

Ejecutor: `scripts/verify-hardware-foundation-local.py`. Evidencia: `docs/hardware-foundation-local-validation.json`, con SHA-256 de la migración probada.

Resultado: **12 grupos PASS**, proceso final con código 0, en PostgreSQL 17.11 para Windows. Se aplicó la migración completa a una base nueva, sin modificar el SQL para ocultar errores. No fue necesario cambiar la migración. Se reforzó el test SQL con el rechazo explícito del tercer tracker cuando el límite es 2.

Comprobaciones ejecutadas:
1. Aplicación atómica e interlock: sin marcador de destino se rechaza y no queda el esquema privado.
2. Suite SQL original con límites 0/1/2, configuración inválida, upsert, reemplazo, historia, RLS y ROLLBACK.
3. Inserciones y triggers bajo el rol real `service_role` del fixture, no solamente como propietario de tablas.
4. Revocación de membresía admin no-owner: pierde lectura de las cuatro tablas nuevas.
5. REPEATABLE READ rechazado explícitamente.
6. Sin configuración de cupo, alta de tracker rechazada por FK.
7. Dos conexiones al último cupo: A confirma, B espera y falla con hardware_limit_reached.
8. Último cupo: A revierte, B espera y puede insertar; B revierte también.
9. Reactivación concurrente: rechazada cuando A ocupa el último cupo.
10. Reducción de cupo concurrente con alta: rechazada si deja el límite por debajo del uso.
11. Un dispositivo vinculado simultáneamente a dos trackers: un solo vínculo; el segundo falla por unicidad.
12. Desactivación concurrente con nueva vinculación: la segunda espera y rechaza el tracker desactivado.

En los seis casos concurrentes se observó `wait_event_type=Lock` de la conexión B antes de resolver A. No se infirió concurrencia de dos ejecuciones secuenciales.

### Aislamiento, limpieza y límites

- El ejecutor no acepta URL/host remoto ni conexión existente. Crea un cluster nuevo, escucha solo en 127.0.0.1, usa puerto libre y contraseña aleatoria SCRAM. No utiliza claves de Supabase ni datos reales.
- El fixture reproduce organizaciones, memberships, auth.uid y la definición inspeccionada de has_org_role_active. Es un fixture mínimo; **no es un clon completo de Supabase**. No reproduce bridges, triggers de alta de organización, PostgREST, billing ni Android.
- Servidor apagado al finalizar; ambos directorios de datos locales de los intentos fueron eliminados con rutas verificadas. El informe registra la limpieza. Los binarios portátiles quedan en caché temporal, no instalados como servicio.
- Docker no estuvo disponible por un error propio de arranque; se usaron los binarios portátiles oficiales de EDB 17.11-4. Se corrigió la captura de salida de pg_ctl en Windows para evitar herencia de pipes del proceso servidor.
- Esta evidencia autoriza a considerar comprobados los guards en el fixture local, no a declarar validado el producto ni la compatibilidad física del GPS.

### Reproducir localmente

Requiere Python con psycopg 3 (usado: 3.3.6) y binarios PostgreSQL 17 (usado: 17.11). No modifica package.json ni dependencias de la app.

```text
python scripts/verify-hardware-foundation-local.py --pg-bin <directorio-local-bin-postgresql> --work-dir <directorio-temporal-local> --report <archivo-json-local>
```

El ejecutor apaga el servidor y conserva el directorio temporal para diagnóstico. Tras verificar server_stopped=true, eliminar únicamente el directorio exacto indicado en el informe; nunca otra instalación PostgreSQL. En esta ejecución esa limpieza ya se completó.

Fuente de los binarios: https://www.enterprisedb.com/download-postgresql-binaries
SHA-256 del archivo descargado: B9424EE7BC60B52450FF910A3630225DF32E633F3CB29C1D126D9299D59AEA28 (registro local de integridad, no comparación con un checksum publicado por el proveedor).


## Integración real en Supabase Preview: PASS con ROLLBACK

Archivo ejecutado: `supabase/verification/hardware_foundation_preview_rollback_integration.sql`.
Evidencia: `docs/hardware-foundation-preview-validation.json`.
Proyecto: `mujwsfhkocsuuahlrssn`, PostgreSQL 17.6. Fecha: 2026-09-27.

El guion contiene una copia exacta de la migración revisada (SHA-256 en la evidencia) y adapta el test psql a una única transacción SQL, eliminando solamente los comandos de cliente y el BEGIN/ROLLBACK interior. Si cambia la migración, regenerar esta copia antes de volver a probar; no asumir que ambos archivos se actualizan automáticamente.

Antes de ejecutar se inspeccionaron los triggers de auth.users, organizations, memberships, org_members, app_user_roles y org_billing, sus helpers alcanzados y los event triggers DDL. No había triggers de alta de auth.users. Los helpers de organización inspeccionados solo escribían en tablas dentro de la transacción; los NOTIFY de actualización de esquema no se entregan al hacer ROLLBACK. No se ejecutó ninguna extensión, envío de correo o llamada HTTP.

La prueba creó exclusivamente tres identidades nuevas sin correo/credenciales y dos organizaciones con UUID nuevos. Se mantuvieron todos los triggers existentes habilitados. Aplicó el borrador, ejecutó la suite de cupos/vinculaciones/RLS y añadió:

- Creación de tracker, dispositivo y vínculo con el rol service_role real.
- Lectura de las cuatro tablas por el administrador ficticio activo y rechazo de acceso a la otra org.
- Revocación del administrador y pérdida de lectura de las cuatro tablas.
- Comprobación del bridge real memberships → org_members → app_user_roles tras la revocación.
- Rechazo de revocación del propietario ficticio, manteniendo owner activo en memberships/org_members/app_user_roles.
- Inicialización FREE de facturación de las dos organizaciones ficticias sin cambiar org_entitlements ni cupos de personas.

Resultado devuelto: PASS, rollback_completed=true. Una segunda llamada independiente confirmó:

| Comprobación posterior | Resultado |
| --- | --- |
| Usuarios ficticios | 0 |
| Organizaciones ficticias | 0 |
| Memberships de fixtures | 0 |
| Org members de fixtures | 0 |
| App user roles de fixtures | 0 |
| Billing de fixtures | 0 |
| Tablas hardware nuevas | 0 |
| Esquema gnss_private | Ausente |
| Registro de migración 20260927125126 | 0 |

No se usó apply_migration ni se registró una instalación: fue un ensayo transaccional revertido. Los locks y objetos sin confirmar impiden compartir estos fixtures entre conexiones; por eso la concurrencia sigue respaldada por las seis pruebas locales, no por una prueba remota de dos conexiones.

Instalación y provisión completadas según el apartado siguiente. Pendiente: ingreso normalizado/simulador, retención efectiva y pruebas de interfaz/Android. No se requiere comprar hardware para esas siguientes etapas. La validación del dispositivo real permanece pendiente.

## Instalación permanente y piloto — 2026-09-27

Aplicada con autorización en Supabase Preview `mujwsfhkocsuuahlrssn` mediante apply_migration. Versión registrada: `20260927174712`. El archivo local se renombró para coincidir con el historial remoto, sin alterar su contenido ni SHA-256 (`2ff7fb89ee4e595477f2e0f8e91f8104a77190db4e6db29e5a27dc135400b470`). Su comentario inicial DRAFT describe el estado de autoría; este apartado registra la instalación posterior. Los informes históricos de pruebas conservan el nombre original.

Se creó por separado la organización ficticia `SIM GPS/GNSS Preview`, slug `geofield-hardware-simulator-preview`, UUID `28b86cea-e91d-4926-8770-755fbc31a5d1`. Su propietario es una identidad ficticia sin correo ni credenciales; no representa un dispositivo ni tiene acceso interactivo. No se asignaron usuarios reales.

Configuración confirmada: hardware habilitado, 2 cupos, exclusivamente simulación y 30 días de retención configurada. Dos trackers activos con modalidad full_route, dos dispositivos normalized-simulator-v1 y dos vínculos abiertos. La provisión usó una sola transacción, bloqueo advisory por clave del piloto y rechazo si el slug ya existía para impedir duplicación por reintentos.

Verificación independiente: los dos trackers/dispositivos/vínculos persisten; owner activo en memberships, org_members y app_user_roles. Un tercer tracker activo fue rechazado con 23514 hardware_limit_reached dentro de una subtransacción; no se conservó esa fila. Evidencia e inventario exacto: `hardware-foundation-preview-installation.json`.

Estos fixtures se conservan para las siguientes pruebas, exclusivamente en Preview. Antes de limpiarlos, usar sus UUID exactos y respetar las relaciones e historia; no deshabilitar triggers ni efectuar borrados amplios.

Pendiente: simulador ejecutable, recepción normalizada autenticada, almacenamiento e idempotencia de posiciones, retención efectiva y visualización. Los 30 días son configuración, todavía no una tarea de purga. No se enviaron posiciones, correos ni se modificó Android. Producción no se consultó ni modificó. Sin commit, push ni deploy en esta etapa.

## Siguiente paso local
Contrato y simulador preparados; 23 pruebas aprobadas. Ver hardware-observation-preview.md. Todavía sin recepción remota ni purga.

## Posiciones: etapa transaccional preparada
Ver hardware-ingestion-preview.md: 30 pruebas JavaScript, 19 grupos PostgreSQL y ensayo Preview revertido. La migración de posiciones aún no está instalada permanentemente; el inventario de esta guía sí lo está.

Actualización: posiciones instaladas en Preview, envío HTTP y cron comprobados. Ver hardware-ingestion-preview.md y hardware-observations-preview-installation.json.
