# Incidencias: núcleo SQL aplicado en Preview

Fecha: 2026-11-04.
Migración: supabase/migrations/20261104194644_incident_core_preview.sql.

Implementado: seis tablas con RLS y sin acceso directo para clientes, claves compuestas para vínculos de la misma organización, lectura backend-only, activación, creación con GPS y parcela autorizada, observaciones, transiciones con motivo, versiones e idempotencia con hash del cuerpo. Actores derivados por futura API; RPC ejecutable únicamente con service_role. Ningún módulo se activa automáticamente. Fotos se rechazan en el núcleo actual: tabla reservada, sin bucket/subidas habilitados. No confundir esta entrega con el módulo completo.

Referencias a geofences y field_visits añaden índices únicos (org_id,id); FKs nuevas impiden cambiar de organización o borrar una parcela/visita que tenga incidencias. Desactivación y cambio de nombre conservan historial. Estas restricciones pueden requerir breve bloqueo al instalar; revisar tamaño y definición de los índices en Preview antes de aplicar.

Validación local realizada con postgres:17-alpine, contenedor sin red ni puertos expuestos y esquema mínimo de dependencias basado en metadatos leídos de Preview. psql ON_ERROR_STOP compiló la migración completa y ejecutó supabase/tests/incidents/core-tests.sql con ROLLBACK. Resultado: aprobado; cero incidencias de fixtures al terminar. Se cubrieron módulo apagado, configuración no autorizada, actor de otra organización, parcela/visita cruzadas, tracker sin asignación, coordenada fuera de rango, fotos no soportadas, reintento idéntico, cuerpo alterado, consulta ajena, restricciones de referencias históricas, estado/versiones/cierre/reapertura, revocación y grants.

Límites de validación: esquema mínimo no reproduce todos los triggers existentes de Preview, Auth/runtime real, PostgREST, carga de fotos, interfaz ni móvil. Las pruebas son secuenciales; concurrencia con conexiones separadas pendiente. No se ha declarado aprobada la experiencia offline.

Aplicación remota: rechazada por revisión automática por cambio persistente de restricciones y funciones sin aprobación explícita del SQL concreto ni pruebas previas. Se continuó con pruebas locales, sin intentar otra escritura remota. Supabase Preview y Producción permanecen sin cambios. Requiere autorización del usuario para esta migración concreta en mujwsfhkocsuuahlrssn; después verificar advisors, grants, compatibilidad de triggers e integración. No ejecutar db push general.

Reproducir localmente: iniciar postgres:17-alpine aislado, ejecutar local-bootstrap.sql, luego la migración y core-tests.sql con psql -v ON_ERROR_STOP=1. local-bootstrap.sql es exclusivamente para una base local vacía, nunca Preview/Producción.

Siguiente integración: API con identidad verificada, manejo de errores SQL y sesión runtime sin escalamiento de privilegios; después UI y evidencias privadas. Sin cambios Android ni publicación web en esta etapa.


## Aplicación autorizada y verificada — 2026-11-04
El usuario autorizó explícitamente aplicar esta migración después del bloqueo inicial. Se aplicó incident_core_preview exclusivamente en mujwsfhkocsuuahlrssn con resultado success. Producción no se consultó ni modificó.
Verificación remota: seis tablas con RLS; anon/authenticated sin SELECT directo; service_role sin INSERT directo; save/read ejecutables solo por service_role, helper interno no ejecutable por esos roles. Ambas FKs de pertenencia por organización presentes. Cero incidencias y cero organizaciones activadas.
Prueba remota con ROLLBACK: read y configure para identidades inexistentes rechazados por insufficient_privilege; cero ajustes persistidos. La batería completa de creación, estados e idempotencia sigue siendo la ejecutada localmente, no una prueba end-to-end en Preview.
Advisors: único tipo de aviso relativo a las tablas nuevas, INFO rls_enabled_no_policy; intencional para acceso exclusivamente por funciones backend con grants restringidos. Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy . No se modificaron avisos previos ajenos al módulo.
Pendientes: API autenticada, interfaz, fotos privadas, pruebas de concurrencia y Android/offline. El módulo continúa apagado para todas las organizaciones.

## Primera interfaz y API — 2026-11-04

Implementados /incidencias y /api/incidents (delegado por api/auth, sin nueva función Vercel). API disponible únicamente si VERCEL_ENV=preview; la navegación aparece en preview.tugeocercas.com. No se activa ninguna organización por desplegar.

La API deriva identidad de Auth/runtime usando identifyVisitActor; runtime solo admite membresía tracker, sin heredar privilegios de otra organización. p_actor procede de ese verificador, nunca del cuerpo. Las lecturas/escrituras usan las RPC del núcleo; el catálogo devuelve parcelas de la organización y, para técnicos, asignaciones propias vigentes compatibles con las reglas SQL. Detalles no consultan catálogos adicionales. Los errores devueltos no exponen mensajes SQL internos.

Pantalla ES/EN/FR: activación por administrador, registro GPS/parcela/categoría/afectación/notas, lista paginada, detalle, observaciones y cambios de estado con motivo/versión. Contexto se reinicia al cambiar organización/usuario. En caso de respuesta incierta se bloquea edición y se reintenta el mismo operation_id y cuerpo; no se regenera identidad tras timeout. Un error de validación/permisos/conflicto permite corregir/actualizar. No persiste borradores: advierte no recargar con datos pendientes.

Fotos, mapa de incidencias, informe, persistencia offline y acceso desde sesión nativa Android siguen pendientes. La ruta web requiere sesión web; aceptar runtime en API no implementa por sí solo la navegación/transporte nativo. No se anunció recepción offline ni se modificó Visitas/GPS.

Validación: 30 pruebas en cuatro archivos (incidents-api, IncidentsPanel, visits-routing y visits) aprobadas; Vite compila. Incluye identidad del servidor, denegación de permisos, bloqueo fuera de Preview, ruta compartida, errores sanitizados y mismo cuerpo/id al reintentar. Son pruebas con mocks; aún falta flujo autenticado real de crear/observar/cerrar en Preview y pruebas físicas. Ninguna prueba activó organizaciones ni insertó incidencias remotas.
