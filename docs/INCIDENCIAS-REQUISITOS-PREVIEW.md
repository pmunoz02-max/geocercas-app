# Incidencias georreferenciadas — requisitos y revisión de arquitectura

Fecha: 2026-11-04. Estado: propuesta para revisión; no implementada.
Alcance autorizado: documentación, lectura del código y metadatos de Supabase Preview mujwsfhkocsuuahlrssn. No se consultó Producción ni se modificaron código, esquema, datos, roles o configuración. No se ejecutaron pruebas de escritura ni despliegues.

## Necesidad y límites de lo confirmado

La conversación aportada con César Muñoz Vélez describe coordenadas, fotografías, nombres y fechas dispersos. El objetivo es reunir cada observación de campo en un registro georreferenciado consultable desde oficina. No se presume validación comercial ni requisitos confirmados por César: las prioridades, el uso premium y las decisiones siguientes son propuestas.

Diseño universal: Incidencias es el módulo; agricultura es una clasificación inicial, no una aplicación independiente. Debe permitir mantenimiento, infraestructura y seguridad sin renombrar tablas por cultivo ni exigir datos agrícolas a todos.

## Resultado mínimo propuesto

1. Propietario/administrador activa voluntariamente Incidencias por organización; apagado por defecto e independiente de Visitas y del seguimiento GPS.
2. Técnico/tracker abre Registrar incidencia desde el móvil. Captura un punto, selecciona parcela autorizada, categoría, afectación y observación; adjunta hasta cinco imágenes.
3. Puede guardar localmente sin red con señalización inequívoca de Pendiente de sincronizar. Guardado local no se presenta como recibido por oficina.
4. Al recuperar conexión y acceso válido se sincronizan registro y evidencias sin duplicar. Oficina consulta mapa/listado, detalle y responsable.
5. El responsable incorpora observaciones y cambios de estado manteniendo autor y fechas. Se genera un informe por incidencia con coordenadas, precisión, fotos y evolución; informe agrupado por lote/fecha como siguiente incremento.

No exige iniciar ni finalizar una visita para registrar una incidencia. Enlace a visita opcional; varias incidencias pueden corresponder a una visita y una incidencia puede recibir observaciones de inspecciones posteriores.

## Datos del registro

| Campo | Propuesta |
|---|---|
| Identidad | UUID generado en dispositivo; organización y autor derivados de credenciales validadas por servidor |
| Título y nota | Título breve obligatorio; descripción libre con límite definido antes de implementar |
| Clasificación | Categoría universal y subtipo opcional; perfil agrícola: plaga, enfermedad, anomalía, otro |
| Diagnóstico | Registrar observación o sospecha, sin afirmar diagnóstico confirmado automáticamente |
| Afectación | No determinada, baja, media, alta; porcentaje opcional 0–100 con unidad/base explícita |
| Localización | Latitud/longitud WGS84, precisión en metros, hora de captura y origen GPS/manual |
| Fechas | observed_at del dispositivo, received_at del servidor; visualización local y exportación inequívoca |
| Parcela | geofence_id autorizado; nombre conservado como referencia histórica; visit_id opcional |
| Responsabilidad | Autor inmutable; responsable de seguimiento opcional y perteneciente a la organización |
| Estado | Detectada → en tratamiento → controlada → cerrada; reapertura por administrador con motivo |
| Evidencias | Cero a cinco fotos por observación; propuesta de 2 MB por foto, siguiendo la capacidad actual de Visitas |
| Control de edición | Versión del registro y operaciones con identificador idempotente |

Porcentaje de afectación y prioridad de atención no deben confundirse: porcentaje expresa una medición sobre una muestra definida; prioridad es una decisión operativa. Sin una base observada, usar afectación cualitativa.

Si no hay GPS se permite conservar borrador, pero no presentar una incidencia como georreferenciada. Antes de sincronizar como registro completo: obtener coordenadas o indicar un punto manual claramente identificado, según permiso. No fabricar precisión para un punto manual. Coordenadas de foto al adjuntar no acreditan dónde fue tomada una imagen de galería; EXIF no es prueba de presencia.

La parcela se propone por contención del punto, con elección explícita si hay solapamientos. Fuera de parcelas: conservar el borrador y permitir al administrador clasificarlo como sin parcela, sujeto a decisión de producto. Nunca asignar silenciosamente la parcela predeterminada. Cambiar geometría o desactivar una parcela no debe mover, borrar ni desvincular incidencias históricas.

## Evidencia de la arquitectura revisada

Fuentes locales: docs/VISITAS.md; src/components/VisitsPanel.jsx (referencia de componente, pendiente inspección detallada de interfaz); src/lib/visitDrafts.js; src/lib/visitUploads.js; server/visits/index.js; vercel.json; migraciones 20260925153909 y 20260925155507.

Metadatos leídos en Preview el 2026-11-04:
- field_visits: id, org_id, user_id, geofence_id obligatorio, assignment_id opcional, started_at, ended_at, document JSONB, created_at, updated_at.
- org_visit_settings: org_id, enabled, updated_by, updated_at.
- geofences: UUID, org_id, name, active, geometría/GeoJSON y campos de auditoría; asignaciones conserva geofence_id y vínculo a persona/usuario.
- RLS habilitado en field_visits y org_visit_settings. Grants consultados: service_role; sin grants para anon/authenticated en esos resultados. Esto no constituye una auditoría completa de permisos heredados o de todas las políticas.
- Bucket visit-evidence privado, JPEG/PNG, máximo 2.097.152 bytes por objeto.
- Definición viva de save_field_visit valida organización/membresía, módulo, geocerca activa y asignación cuando corresponde. Visitas cerradas son inmutables. Rechaza nuevos inicios anteriores a 30 días y más de cinco minutos futuros: no copiar esta ventana sin definir la política offline de Incidencias.

Código revisado: fotografías subidas individualmente; comprobante HMAC ligado a organización, usuario y visita; guardado final confirma referencias. Cola IndexedDB separada por scope y revisión; confirmación solo elimina la misma revisión. Hay patrones reutilizables, no compatibilidad automática con nuevas entidades.

La ruta /api/visits se delega a api/auth mediante vercel.json y server/visits; evita aumentar funciones independientes. Revisar el plan/límite de despliegue vigente antes de añadir endpoint. El transporte Android documentado admite una ruta concreta de Visitas: Incidencias requiere revisar/ampliar expresamente ese contrato, nunca abrir un transporte arbitrario.

## Arquitectura propuesta, sin SQL ejecutable

Tablas aditivas propuestas: org_incident_settings (activación), incidents (identidad, parcela, punto, clasificación, estado actual, versión), incident_observations (notas y evolución), incident_evidence (objetos privados y metadatos), incident_events (auditoría de estados/asignaciones). Nombres provisionales; ajustar después de revisar índices, claves y permisos completos.

Reutilizar autenticación web/runtime, catálogo de geocercas, patrones de carga individual de fotos y presentación de mapas. Mantener registros separados de field_visits.document: evita forzar visitas abiertas o modificar una visita cerrada para actualizar una incidencia. Enlace a visita debe validar organización y permisos, no solo existencia del UUID.

API mediada por backend con identidad derivada de sesión, validación de organización en cada operación y acceso privado a evidencias. RPC/transacción para guardar operación, versión y evento de forma atómica. Si se adopta SECURITY DEFINER, acceso restringido y revisión específica de grants; no trasladar la clave de servidor al cliente. Bucket independiente de evidencias propuesto para evitar colisiones y políticas ambiguas con Visitas.

## Permisos propuestos

- Propietario/admin: activar, consultar/exportar toda su organización, asignar responsables, cambiar estado, cerrar y reabrir.
- Tracker/técnico: registrar en parcelas autorizadas, consultar sus incidencias y añadir observaciones propias; sin acceso al historial completo de otras personas.
- Responsable de seguimiento: decisión pendiente sobre si se permite a miembros no administradores gestionar incidencias ajenas. No crear un nuevo rol global durante el piloto.
- Sesión revocada, organización suspendida o cambio de cuenta: retener borrador local sin sincronizar a otra identidad; mostrar recuperación necesaria. El servidor revalida acceso al sincronizar.
- Módulo desactivado: detener altas, conservar consulta/historial; definir expresamente cómo se tramitan borradores previos y cierres, evitando su pérdida silenciosa.

## Operación sin conexión y conflictos

Distinguir tres capacidades: guardar tras cargar previamente el módulo, reabrir la interfaz sin internet, sincronizar con app cerrada. Solo la primera tiene un patrón implementado en Visitas; las otras requieren validación web/Android y trabajo específico. El piloto propuesto incluye las dos primeras; sincronización con app cerrada queda fuera hasta diseñarla y probarla explícitamente.

Cola nueva separada por entorno/origen, organización y usuario; conservar fotos hasta confirmación completa. Cada operación tiene UUID estable; reintentos y timeout posterior a guardado no deben duplicar. Estados visibles: borrador, pendiente, sincronizando, sincronizado, requiere intervención.

Observaciones añadidas se conservan como eventos. Cambios concurrentes de estado usan versión esperada y devuelven conflicto; no sobrescribir el trabajo de oficina con un borrador antiguo. Foto fallida mantiene pendiente la evidencia y nunca se presenta el registro como completo. Comprobantes caducados se renuevan mediante reenvío idempotente con permisos vigentes.

Probar cierre/reinicio del móvil, pérdida de red durante subidas, almacenamiento lleno, borrado de datos locales y sesión vencida. No se puede garantizar conservación tras desinstalar o borrar datos. Definir cuota local, aviso de espacio y política de limpieza de objetos subidos sin referencia antes de lanzar. Visitas actualmente puede dejar objetos huérfanos; no copiar esa deuda sin una decisión explícita.

## Informes y GIS

MVP: informe generado a demanda por incidencia, apto para imprimir/PDF, con identificador, lote, autor, hora observada/recibida, coordenadas/precisión, categoría, afectación, notas, estado y fotos autorizadas. No prometer envíos programados automáticos en el primer incremento. Exportación CSV/GeoJSON en fase posterior: WGS84, coordenadas GeoJSON [longitud, latitud], fechas ISO 8601, filtros/organización respetados y protección contra fórmulas CSV. No exportar URLs firmadas caducables como archivos permanentes de evidencia.

## Etapas y criterios de aceptación

1. Confirmar esta especificación y preguntas abiertas; prototipo de flujo móvil/oficina sin escritura.
2. Diseñar migración aditiva y contrato API; revisar esquema real, claves, grants y aislamiento antes de presentar SQL.
3. Implementar en Preview una entrega vertical: activación, registro con punto/parcela, fotos privadas, cola local y consulta de oficina.
4. Añadir evolución/estados e informe; probar apertura offline y recuperación en Android físico antes del piloto.
5. Piloto con César para validar terminología, afectación, utilidad de informe y trabajo sin conexión. GIS, informes agrupados y precios después de evidencia de uso.

Criterios: una operación repetida produce una incidencia; fotos no accesibles entre organizaciones; tracker no obtiene registros ajenos; cambios de parcela preservan historia; modo avión conserva texto/fotos tras reinicio; sin conexión desde cero no se promete acceso hasta comprobar caché/paquete; conflicto no pierde observaciones; informe coincide con datos y fotos confirmados; GPS continuo y Visitas existentes no cambian. ES/EN/FR desde el diseño. No declarar piloto aprobado solo con mocks.

## Decisiones de producto pendientes

- ¿Incidencias sin parcela y puntos manuales permitidos, y para qué roles?
- ¿Quién puede cerrar/reabrir y quién ve incidencias de otros técnicos?
- ¿Afectación cualitativa suficiente o porcentaje con muestra/unidad obligatorio?
- ¿Informe individual imprimible suficiente para el piloto? ¿Cuánto tiempo máximo debe trabajar sin red?
- Cuota total de imágenes/observaciones, conservación, cierre y borrado; cinco fotos por observación no limita el almacenamiento total por incidencia.
- Módulo premium PRO/Enterprise y precio: hipótesis comercial, no habilitar cobros ni cambiar planes todavía.

No se precisa resolver estas preguntas para concluir esta revisión; sí antes de fijar la migración y aceptación del piloto. No se han creado tablas de incidencias, pantallas, endpoints ni cambios Android.
