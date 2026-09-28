# GPS/GNSS universal: auditoría y propuesta para Preview

Fecha: 2026-09-27. Estado: propuesta; NO implementada.
Alcance: Supabase Preview mujwsfhkocsuuahlrssn y branch preview. Sin cambios en Producción, SQL de escritura, pruebas con datos, push ni deploy.

## 1. Evidencia y límites de la auditoría

Se consultaron catálogos de columnas, constraints, índices, RLS, grants, vistas, funciones y triggers, sin consultar filas de negocio ni ejecutar las funciones inspeccionadas.

- Vercel: preview.tugeocercas.com apunta al deployment dpl_FaYFPHaknAweWMxRGddfrrnbZiQm, READY, origen branch preview, commit 6c0bb5f6b4db4b39b1425eed979a04aa91b2b843. HEAD local coincide y api/send-position.js no tiene diferencias locales. Se verificó procedencia del deployment, no se descargó ni comparó su bundle ejecutable ni se probaron posiciones reales.
- La Edge Function send_position desplegada en Preview, versión 185, escribe en positions.
- Android Preview local usa https://preview.tugeocercas.com/api/send-position. No se verificó en esta auditoría el APK instalado.
- api/send-position.js escribe en tracker_positions y descarta puntos fuera de una geocerca asignada activa (respuesta stored:false).
- positions tiene un trigger AFTER INSERT que actualiza tracker_latest; el upsert no impide sobrescribir una posición reciente con una atrasada.
- tracker_latest tiene un trigger AFTER INSERT OR UPDATE que llama a refresh_tracker_health_row mediante tg_refresh_tracker_health_from_latest.
- No se encontraron triggers no internos en tracker_positions ni un bridge automático entre ambas tablas.
- sync_tracker_geofence_events_for_position lee tracker_positions. No se encontró una llamada desde api/send-position.js ni un trigger de inserción que la invoque. Una función demo la llama explícitamente; no se ejecutó.
- La función de eventos recorre geocercas activas y busca su equivalente en geofences por source_geocerca_id o nombre. No limita ese recorrido a asignaciones ni implementa explícitamente ordenación de puntos atrasados o serialización concurrente.
- No existe cron.job en el catálogo consultado. Esto no descarta programadores externos.

Flujo verificado por código y metadatos:

    Android Preview local -> /api/send-position -> tracker_positions
    Edge send_position -> positions -> tracker_latest -> tracker_health

Las guías backend-send-position.md y TRACKER_SYSTEM.md son referencias históricas que no describen de forma completa ambos caminos actuales. Este documento no certifica el funcionamiento de Producción.

## 2. Dependencias que impiden usar IMEI como user_id

- positions y tracker_positions requieren user_id; sus índices temporales incluyen organización o usuario.
- tracker_latest tiene unicidad por (org_id, user_id).
- tracker_assignments.tracker_user_id referencia users_public; las restricciones e índices de asignaciones dependen del usuario y la geofence. Existe un límite de frecuencia >= 5 minutos.
- v_tracker_dashboard une asignaciones con personal por org_id/user_id; exige una persona asociada. v_tracker_status también usa identidad personal.
- v_tracking_coverage_preview agrupa tracker_positions por organización, usuario, personal y día UTC. v_tracking_live_health utiliza positions y tracker_latest.
- Las funciones de rutas y costos revisadas enlazan posiciones con asignaciones basadas en usuarios.
- tracker_geofence_events.geocerca_id referencia geofences, aunque la geometría se obtiene de geocercas.
- refresh_tracker_health_row mezcla antigüedad (2/10 minutos) con permisos y servicio Android; rpc_refresh_tracker_health usa únicamente antigüedad. Estas reglas deben reconciliarse antes de aplicarlas a hardware.

RLS está habilitado en las cinco tablas principales inspeccionadas. Las cuatro vistas inspeccionadas tienen security_invoker=true. Hay políticas de inserción que comprueban solo auth.uid()=user_id, y tp_select_org_members no exige explícitamente revoked_at IS NULL. Deben revisarse con pruebas de aislamiento y revocación: no se ha demostrado explotación ni evaluado toda la cadena de RLS de las tablas referenciadas. Los grants amplios tampoco equivalen por sí solos a acceso efectivo mediante REST.

## 3. Modelo propuesto, sin DDL todavía

El tracker lógico representa lo seguido, independientemente del origen de posiciones.

| Entidad conceptual | Propósito y reglas |
| --- | --- |
| Tracker | ID estable, organización, nombre, tipo persona/vehículo/equipo y estado. No es una cuenta de autenticación. |
| Identidad móvil | Relación explícita entre tracker y usuario dentro de la misma organización; conserva las sesiones y consentimiento existentes. |
| Dispositivo | Fabricante, modelo, identificador como IMEI, protocolo, estado y credencial/restricción de conexión. IMEI identifica, no es un secreto suficiente. |
| Vinculación | Dispositivo a tracker con período de vigencia. Un dispositivo no puede estar activo simultáneamente en dos trackers. Un traslado no reasigna el historial anterior. |
| Asignación | Tracker a geocerca y período; el vínculo móvil legacy se conserva durante transición. |

Preferencia inicial: un origen principal activo por tracker. Si se admite móvil y GPS simultáneos, definir prioridad explícita; no fusionar posiciones solo porque comparten conductor. El gateway no acepta org_id/user_id elegidos por el paquete: los resuelve mediante el registro autorizado y la vinculación vigente para el evento. Paquetes ambiguos durante un traslado quedan en cuarentena.

Los nombres definitivos (por ejemplo trackers/tracker_devices) y la ubicación de tracker_id se decidirán tras revisar también los triggers y permisos de las entidades que se modifiquen. No reutilizar UUID ficticios de usuarios ni eliminar NOT NULL como parche.

## 4. Recepción común propuesta

    Android autenticado ------> adaptador móvil ----+
                                                   +-> ingreso normalizado -> historial / estado / eventos
    GPS -> gateway persistente -> adaptador protocolo+

El gateway TCP opera como servicio independiente de Vercel y de las Edge Functions HTTP. Primer adaptador previsto: Teltonika FMC920. Codec, variantes regionales, seguridad de transporte y ACK se validarán contra documentación oficial y paquetes de prueba antes de implementar; no se certifican aquí.

Contrato conceptual de una observación:
- source_identity_id, identidad del origen autenticado; tracker_id y org_id resueltos por backend.
- event_id o clave idempotente estable por origen, versión de normalización y evento.
- recorded_at del dispositivo y received_at del servidor; secuencia cuando el protocolo la aporte.
- latitud, longitud, validez del fix y, si existen, precisión, velocidad, rumbo y batería, con unidades normalizadas.
- Metadatos técnicos mínimos; límites de tamaño y retención definidos. No registrar tokens.

No inventar precisión cuando el dispositivo solo informa otro indicador. Separar señales de comunicación de fixes GNSS válidos. Una retransmisión no debe renovar artificialmente la antigüedad de una posición.

Procesamiento propuesto:
1. Autenticar origen y resolver organización, tracker y período de vinculación.
2. Validar formato, coordenadas, unidades, reloj, vigencia y política de recepción.
3. Deduplicar con una clave estable; no usar solo lat/lng ni solo timestamp, porque puede haber observaciones legítimas iguales.
4. Guardar de forma durable antes de confirmar recepción al dispositivo. Si se usa cola, ACK tras persistencia durable; reintentos al consumidor sin perder idempotencia.
5. Aplicar historial, último estado y evento pendiente en una transacción o mediante outbox transaccional; evitar escrituras parciales entre esos efectos.
6. Actualizar última posición solo si su orden temporal es posterior. Definir desempate determinista para timestamps iguales. Guardar puntos atrasados en historial sin retroceder el estado actual.
7. Serializar cambios de estado por organización/tracker, con orden de bloqueo consistente. Clave única de observación y de evento derivado para reintentos concurrentes.
8. Para geocercas, procesar transiciones en orden temporal; puntos atrasados requieren reconciliación histórica, no disparar un EXIT actual por llegada tardía.

Conservar recorded_at y received_at permite distinguir pérdida de red, falta de fix, envío diferido y desconexión. La salud debe usar la frecuencia esperada y tolerancia del origen; no trasladar ciegamente los umbrales de 2/10 minutos ni el estado pending_permissions de Android.

## 5. Compatibilidad y decisiones pendientes

- Mantener contratos móviles y sesiones existentes mientras se introduce el modelo nuevo detrás de una bandera Preview.
- No activar doble escritura independiente: elegir una autoridad y una proyección compatible, con transacción/outbox y reconciliación medible.
- No activar sin revisión la función de eventos existente: hoy recorre todas las geocercas activas y hay fallback por nombre. Preferir vínculo explícito estable y geometría versionada para evaluar históricos.
- La regla móvil de descartar puntos externos se conserva hasta decisión expresa. Para GPS vehicular, proponer almacenamiento de recorrido autorizado fuera de geocercas; sin esos puntos no se pueden deducir salidas completas de forma fiable.
- Cuotas de hardware y facturación deben definirse separadamente de memberships de personas. No consumir ni ampliar cupos por inferencia.
- Hardware no habilita automáticamente Visitas, notas o fotografías: esas acciones siguen perteneciendo a usuarios autorizados.
- Credenciales backend nunca en el dispositivo; aislar claves, registros y gateway Preview de Producción.

## 6. Secuencia mínima de implementación futura

1. Aprobar modelo y decisiones de retención, cuota y seguimiento exterior; completar metadatos de cada objeto afectado y revisar permisos efectivos.
2. Preparar migración aditiva con restricciones entre organización/tracker/origen, backfill móvil determinista y plan de reversión. Revisar antes de ejecutar.
3. Crear ingreso normalizado y proyecciones compatibles; probar con datos ficticios exclusivamente en Preview.
4. Adaptar asignaciones, dashboard y reportes para tracker lógico, preservando pruebas móviles.
5. Construir gateway y adaptador Teltonika, primero con simulador y luego dispositivo real. Verificar especificación oficial antes del decoder.
6. Ejecutar pruebas de recuperación, aislamiento y carga; habilitación gradual en Preview. Publicación y cualquier paso en Producción requieren orden expresa.

No modificar geocercas, roles ni historial existente como efecto lateral del alta de un dispositivo. Desactivar hardware debe cortar nuevos ingresos sin borrar la auditoría.

## 7. Pruebas y criterios de aceptación

| Prueba | Resultado exigido |
| --- | --- |
| Android actual | Sesión, renovación, permisos, frecuencia y visualización siguen funcionando. |
| Dos organizaciones | Ningún origen escribe o lee en otra organización; membresía revocada pierde acceso conforme al rol. |
| Dos conexiones, mismo paquete | Una sola observación y un solo efecto derivado; reintento reconocido. |
| Puntos fuera de orden | Historial completo, última posición nunca retrocede; eventos actuales no se corrompen. |
| Corte entre persistencia y ACK | Reenvío seguro sin pérdidas ni duplicados. |
| Cola/backend caído | Recuperación durable, métricas de retraso y límite de capacidad; sin confirmar datos perdidos. |
| Reinicio del GPS y secuencia repetida | Idempotencia distingue eventos nuevos de retransmisiones. |
| Reloj futuro o inválido | Rechazo/cuarentena explícita; no mantiene tracker falsamente online. |
| Paquete sin fix | Comunicación registrada separadamente; no inventa coordenadas. |
| Cambio de dispositivo o de organización | Historia conserva propietario original; lotes atrasados no cruzan organizaciones. |
| Entrada/salida y geometría editada | Transiciones reproducibles según política/versionado, sin duplicados por concurrencia. |
| Dashboard/reportes | Vehículo visible sin personal ficticio; resultados móviles equivalentes a línea base. |
| Desactivación/credencial revocada | No admite nuevos eventos; historial preservado. |

Pruebas aún NO ejecutadas. Este documento no autoriza migraciones ni constituye garantía de funcionamiento del gateway.

## 8. Decisiones del piloto y primer borrador (2026-09-27)

El usuario aceptó 2 trackers hardware en Preview, recorrido completo y retención de 30 días, con simulación antes de comprar el dispositivo. Se preparó la migración de inventario/cupos/vinculaciones y sus pruebas, SIN aplicarla. El detalle y las limitaciones están en [hardware-tracker-foundation-preview.md](hardware-tracker-foundation-preview.md).

Esta entrega no modifica el pipeline móvil, no almacena posiciones hardware, no implementa la purga ni activa organizaciones. La recepción común y el simulador son las etapas siguientes; la validación física permanece pendiente.


## 9. Avance de validación local

La migración de inventario/cupos/vinculaciones pasó 12 grupos de pruebas en PostgreSQL local 17.11, incluidos seis escenarios con dos conexiones y espera de bloqueo observada. Ver `hardware-tracker-foundation-preview.md` y `hardware-foundation-local-validation.json`. Datos ficticios locales eliminados y servidor apagado. No se ha aplicado esta migración en Supabase Preview ni Producción; falta integración con el esquema completo, recepción de posiciones, simulador y retención efectiva.


## 10. Integración Preview con ROLLBACK

La prueba `hardware_foundation_preview_rollback_integration.sql` pasó en el esquema real de Preview, incluyendo los bridges de roles y protección del propietario. Se revirtió toda la transacción y una consulta independiente confirmó cero fixtures, objetos hardware o entradas de migración restantes. Ver `hardware-foundation-preview-validation.json`. En ese ensayo no hubo instalación permanente. Posteriormente se instaló la base y se provisionó el piloto en Preview; ver hardware-tracker-foundation-preview.md. Todavía no hay recepción hardware ni cambios en Producción. La concurrencia de dos conexiones está validada localmente; este ensayo remoto fue de una conexión.
