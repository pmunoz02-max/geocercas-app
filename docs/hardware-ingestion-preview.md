# Posiciones hardware: recepción y retención Preview

Estado: migración instalada permanentemente en Supabase Preview. Envío HTTP del simulador verificado. Sin push ni cambios en Producción. Ver evidencia de instalación al final.

## Archivos y contrato
- supabase/migrations/20260928030944_hardware_observations_preview.sql: dos tablas, recepción, consulta de última posición y purga.
- lib/hardware/preview-client.mjs y scripts/run-hardware-preview.mjs: cliente backend limitado al proyecto mujwsfhkocsuuahlrssn y dispositivos del piloto documentado.
- scripts/verify-hardware-observations-local.py: extensión de las pruebas PostgreSQL locales.
- supabase/verification/hardware_observations_preview_rollback.sql: copia de la migración y ensayo completo revertido. Regenerar si cambia la migración.
- docs/hardware-observations-local-validation.json y hardware-observations-preview-validation.json: evidencia real.

RPC de recepción: ingest_hardware_observation_preview(p_device_id uuid, p_observation jsonb). Solo service_role. El dispositivo lo proporciona el backend autorizado, no el JSON del paquete. Versión 1, event_id, recorded_at UTC canónico con milisegundos, fix_valid y coordenadas. Resuelve org/tracker/vínculo en base de datos; admite únicamente dispositivos simulados normalized-simulator-v1, habilitados en una organización simulation_only. No valida ningún IMEI físico ni autentica equipos reales.

Devuelve status=stored o duplicate, tracker_id y received_at. Conflicto de contenido con el mismo device_id/event_id: 23505 idempotency_conflict. El reenvío idéntico mantiene received_at original y no produce actividad ficticia. El ACK depende del commit; si se pierde la respuesta, repetir el mismo archivo y los mismos identificadores.

La RPC resuelve la vinculación vigente en recorded_at. Un punto anterior al primer vínculo se rechaza. Un lote atrasado de un vínculo cerrado conserva el tracker original si dispositivo, organización y tracker siguen habilitados. El historial no se traslada al reemplazar dispositivo. inside_only se rechaza explícitamente en esta fase. No se calculan eventos de geocercas.

Última posición: hardware_latest_preview(org,tracker), SECURITY INVOKER, orden recorded_at, event_id con collation C y device_id como desempate final entre dispositivos. Solo fixes válidos. No hay copia de estado que pueda sobrevivir accidentalmente a la purga. La comunicación sin fix queda en historial y no sustituye coordenadas. Todavía no hay indicador online ni integración con el dashboard.

## Bloqueos y seguridad
La recepción toma el bloqueo organizations FOR NO KEY UPDATE existente antes de volver a leer configuración/dispositivo y persistir. La purga usa el mismo bloqueo. READ COMMITTED obligatorio según el guard existente. Serializa todo el piloto por org, suficiente para esta fase; medir antes de ampliar volumen. Operaciones múltiples deben adquirir organizaciones por UUID ascendente antes de filas hijas y reintentar la transacción completa ante deadlock/serialización, con mismos event IDs.

Las tablas no conceden escritura directa a anon, authenticated ni service_role. service_role escribe mediante RPC. Lectura authenticated solo owner/admin activo de esa organización y dentro de retención. PUBLIC/anon no ejecutan las RPC. search_path vacío y referencias calificadas. La función de última posición conserva RLS.

## Retención
purge_hardware_observations_preview(org,batch_size=1000), solo service_role, elimina como máximo 10000 registros por llamada y devuelve deleted/cutoff/has_more. Adquiere primero el bloqueo de la organización. La marca purged_through solo avanza: ampliar el plazo no permite reinsertar observaciones anteriores a esa marca. Claves idempotentes y coordenadas están en la misma fila y se eliminan juntas. La historia de vínculos permanece en inventario, sin coordenadas.

La lectura de usuario y última posición excluyen inmediatamente lo vencido, incluso antes del borrado físico. No confundir ocultamiento con eliminación. La clave backend es privilegiada y sus lecturas directas pueden ver filas pendientes de purga.

**Estado previo a instalación (histórico): no había programador de purga activado.** Antes de habilitar ingreso continuo, instalar la migración, configurar un trabajo periódico en Preview (por ejemplo cada 15 minutos), comprobar ejecuciones y alertar si has_more persiste. La función por lotes y el comando manual están probados, no una tarea recurrente. No crear cron de Producción ni asumir que existe pg_cron. Si cambia la política, las lecturas usan el plazo vigente y la marca de purga; datos no purgados pueden volver a ser visibles si se amplía el plazo.

## Cliente backend preparado
Requiere SUPABASE_URL exactamente https://mujwsfhkocsuuahlrssn.supabase.co, SUPABASE_SERVICE_ROLE_KEY exclusivamente del servidor y HARDWARE_PREVIEW_ENABLED=true. No cargar claves en variables VITE ni en el APK. El cliente bloquea otros destinos y redirecciones, usa timeout y no imprime respuestas arbitrarias del servidor ni claves.

Comandos, una vez instalada la RPC:
- node scripts/run-hardware-preview.mjs send <batch.json>
- node scripts/run-hardware-preview.mjs purge

El batch contiene hasta 100 objetos con device_id y observation; solo IDs del inventario ficticio documentado. Debe generarse una vez y conservarse para reintentos. El lote completo se valida antes de enviar, pero cada observación tiene su propia transacción: un fallo intermedio requiere reenviar el mismo lote. La base decide retención efectiva. Este cliente no es un endpoint HTTP público ni un servidor TCP.

## Verificación ejecutada
30/30 pruebas JavaScript en dos archivos. 19 grupos PostgreSQL aprobados (12 de la base anterior y 7 de posiciones). Ocho escenarios con dos conexiones y espera de bloqueo observada: seis de inventario y dos reenvíos simultáneos, con commit y rollback de A. Comprobados: duplicados, conflicto, no-fix, atrasados, fechas/coordenadas inválidas, grants, RLS, revocación, vínculo histórico, purga por lotes y protección contra reingreso tras ampliar retención.

El ensayo en el proyecto real Preview usó las dos tablas nuevas dentro de BEGIN/ROLLBACK y el primer dispositivo ficticio ya existente. Probó recepción como service_role, duplicado, conflicto, última posición, no-fix, purga de cero filas recientes, lectura owner y rechazo de otra identidad. Resultado PASS; una consulta independiente confirmó tablas y RPC ausentes, cero entradas de migración nueva y los dos trackers del piloto intactos. No se conservaron observaciones.

No se ha probado todavía un envío HTTP real ni un GPS físico. Android y sus tablas no se modificaron.

Fuentes consultadas: https://supabase.com/docs/guides/database/functions y https://supabase.com/changelog.md. El diseño usa SECURITY DEFINER restringido y search_path vacío; el catálogo de objetos y event triggers de Preview se inspeccionó antes del ensayo.

## Instalación y envío HTTP completados — 2026-09-28 UTC

Instalada en Preview la migración 20260928030944_hardware_observations_preview.sql. El archivo original se renombró para coincidir con la versión asignada por Supabase, manteniendo su contenido y SHA-256 7f3ed4e03d2c2bf0e0a39efc3938b6a5aeb42815e3b21646befd42abaa5355aa. Informes y ensayo anteriores conservan el nombre histórico.

Instalada pg_cron 1.6.4 mediante migración 20260928031007_hardware_preview_cron_extension.sql. Job 1 hardware-pilot-retention-preview: activo cada 15 minutos, restringido al slug geofield-hardware-simulator-preview y simulation_only. Hasta 10000 filas por ejecución, statement_timeout 30s y lock_timeout 5s. No elimina datos móviles ni de otras organizaciones. Configuración reproducible en supabase/verification/hardware_preview_retention_schedule.sql.

Se verificó una ejecución automática inicial con frecuencia temporal de un minuto: succeeded a las 03:12 UTC. Después se cambió y verificó la frecuencia definitiva de 15 minutos. La marca de purga existe. Los dos puntos recientes permanecen; no se insertaron registros artificialmente vencidos en la base remota. El borrado de registros vencidos está probado localmente. No hay alertas externas ni limpieza automática del historial de cron; revisar job_run_details y el atraso de purga antes de escalar el piloto.

Envío HTTPS real mediante PostgREST y cliente backend, con clave Preview leída solo en memoria: dos dispositivos, dos posiciones ficticias (0,0), y reenvío de cada paquete. Resultado stored/duplicate con received_at idéntico. Quedaron exactamente dos observaciones, sujetas a retención. No son posiciones de personas ni de dispositivos físicos.

Evidencia: hardware-observations-http-validation.json y hardware-observations-preview-installation.json. Permisos verificados: recepción denegada a anon/authenticated, permitida a service_role. Producción no consultada ni modificada. Sin commit, push ni deploy de web/Android.

Siguiente fase: visualización separada del piloto en Preview y recorrido simulado, con distinción explícita de hardware frente a móvil. La recepción backend funciona; todavía no hay gateway TCP, certificación de dispositivos reales ni hardware en el dashboard.

Vista /hardware-piloto preparada localmente y 24 puntos de recorrido enviados a Preview. Ver hardware-pilot-view-preview.md. Pendientes cuenta autorizada, revisión visual y publicación web.
