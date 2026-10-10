# Pendientes para Producción

Actualizado: 2026-10-09. Registro solicitado por el usuario. Mantener este archivo al completar mejoras en Preview y cerrar cada entrada solo con evidencia de publicación/verificación en Producción.

No autoriza Promote ni migraciones de Producción. Solo branch preview; nunca push a main. No incluir datos, simuladores ni configuración de Preview en Producción. Promote web no aplica migraciones ni publica Android.

## Confirmados pendientes: geocercas

- [ ] Eliminación en la organización seleccionada (7686d699). Publicar mediante Promote del deployment revisado de preview. Cliente envía x-org-id; servidor lee el cuerpo antes de resolver membresía; no cambia a otra organización si falta membresía. Cuatro pruebas aprobadas y usuario confirmó eliminación en Preview.
- [ ] Liberar cupo de geocercas desactivadas (5d76adfc). Requiere aplicar específicamente supabase/migrations/20261009222613_geofence_quota_exclude_inactive.sql a Producción, previa comparación de su función/esquema. Aplicada y probada solo en Preview: creación tras baja lógica funciona; segunda geocerca activa bloqueada por cupo FREE; ROLLBACK sin fixtures persistidos. Conservar historial. Pendiente confirmación de guardado desde UI del usuario.
- [ ] Verificar en Producción el ciclo crear → eliminar/desactivar → crear, contador y límite, sin borrar historial ni usar datos reales como fixtures.

## Otros candidatos de Preview: verificar contra la versión de Producción antes de promover

Esta sección es inventario de cambios encontrados, no afirmación de que todos falten en Producción. Determinar el commit desplegado y las migraciones aplicadas antes de cerrar el alcance.

- [ ] Organización seleccionada al guardar geocercas (c09ec494).
- [ ] Apertura Android desde sesión del navegador, identidad de sesión y aislamiento de cola/conteos (3c3df72d, 9888e669, df3624d7). Revisar compatibilidad y separar configuración de cada entorno.
- [ ] Inicialización y encuadre del mapa: ref React Leaflet, límites visibles y conservación del encuadre manual (6949b9b3, 0cb86cae, 8957e92a).
- [ ] Identificación de trackers GPS y filtros (7e586825).
- [ ] Backend de speed/heading opcionales (789f15f6): comprobar cambios de esquema y funciones antes de publicar; no basta con Promote web.
- [ ] Android: telemetría speed/heading, recuperación según intervalo y callbacks estacionarios. Parche/pruebas archivados en 9989a64f y docs/android-patches/motion-telemetry-preview. Preparar y probar una versión firmada de Producción y distribuir por Google Play; no copiar el paquete/configuración Preview. No trasladar el modo intensivo de diagnóstico. Consumo de batería/datos aún no medido.
- [ ] Optimización R8 solicitada para la siguiente versión Android: verificar implementación y compatibilidad antes de publicar.

## Fuera de la publicación automática

- Hardware GPS/GNSS: integración/pilotos y receptor tienen alcance Preview. No trasladar simulaciones, identidades de prueba ni configuración del receptor a Producción. Su lanzamiento requiere revisión separada.
- Archivos locales modificados o sin seguimiento no son automáticamente candidatos. Revisar su contenido y pruebas antes de incluirlos; no incorporar cambios ajenos mediante un commit general.

## Registro de ejecución

Todavía no se ha realizado ninguna acción en Producción como parte de este registro. Para cada publicación futura anotar fecha, commit/deployment, migraciones exactas, versión Android si corresponde y resultado de verificación.

## Asignaciones: nombres históricos (2026-10-09)
- [ ] Corrección en Preview: cargar nombres de geocercas desactivadas para la tabla, manteniéndolas fuera del selector de nuevas asignaciones. Sin migración ni cambios de vínculos. El usuario confirma que en Producción su tabla ya muestra nombres; evaluar este caso de geocerca desactivada al revisar el próximo Promote, no tratarlo como incidente confirmado de Producción.
