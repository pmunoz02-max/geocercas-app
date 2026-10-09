# Android Preview: speed y heading — 2026-10-09
## Estado actual verificado

APK debug instalado exclusivamente en com.fenice.geofieldgps.preview con la misma firma y datos conservados. Incluye speed/heading opcionales, diagnóstico solo debug, umbral de recuperación según intervalo y callbacks sin distancia mínima. 17 pruebas aprobadas y assembleDebug correcto. Las secciones siguientes conservan la secuencia histórica; sus menciones a pendiente de instalación corresponden a cada etapa, no al estado actual.

Prueba estacionaria: callbacks recientes cada 59–63 s sin recuperación durante observación. Caminata del 09/10/2026 desde 12:53:10 Ecuador: siete posiciones hasta 12:58:14; tres con speed y una con heading. A las 12:55:22 se guardaron speed=0.339716672897339 m/s y heading=53 grados, accuracy reportada=9 m. Retraso de inserción 0.6–1.9 s. Diagnóstico debug no habilitado durante esa caminata: no se atribuyen NULL a proveedor específico ni se concluye ausencia de recuperaciones. No se midieron batería ni datos móviles; no se calcula precisión real a partir de accuracy. Los timestamps del payload todavía representan el envío, no la captura Location.

Android reside en una carpeta independiente sin repositorio Git; la branch preview corresponde al repo web, que guarda esta documentación. Cualquier commit posterior debe considerar esto sin copiar Android a ciegas ni incluir cambios ajenos. Sin commit, push ni publicación.

Alcance local: `geocercas-twa-preview`, applicationId `com.fenice.geofieldgps.preview`, web repo en branch preview. No build release, APK/AAB nuevo, instalación, envío GPS de prueba, commit, push ni despliegue.

`ForegroundLocationService` entrega el objeto Location al constructor del payload. `writeLocationMotionTelemetry` consulta `hasSpeed()` y `hasBearing()` antes de leer sus valores. Publica `speed` en m/s y `heading` desde bearing, en grados [0,360). Heading es rumbo de desplazamiento, no orientación del teléfono.

Los campos siempre existen en los nuevos payloads: si el dato no está disponible, se usa `JSONObject.NULL`, no null de Kotlin (que eliminaría la clave). El cero disponible se conserva. Como defensa contra datos inválidos del proveedor, valores no finitos o fuera del rango del backend se convierten en JSON null. Latitude, longitude, accuracy, identidad runtime, fechas y el resto de campos mantienen su comportamiento previo.

La cola offline no cambia. Sus funciones existentes buildQueueItem/getQueueItemPayload clonan el JSON completo, de modo que preservan los nuevos números y null al persistir/reintentar. Los elementos antiguos sin estos campos siguen siendo compatibles con el backend, que guarda SQL NULL cuando faltan. La renovación de sesión y la cuarentena por organización/usuario no cambian.

El backend Preview ya admite speed/heading en tracker_positions (commit 789f15f6). Este cambio Android aún es local y no cambia la app instalada. No se modifican tablas, RLS, endpoint ni frecuencia GPS.

Pruebas: LocationMotionTelemetryTest con Location/JSONObject bajo Robolectric. Comprueba disponibilidad, valores cero y decimales, campos independientes, removeSpeed/removeBearing, datos inválidos y el recorrido por las funciones reales de la cola offline (valores, null y payload antiguo). Dependencias de prueba JUnit 4.13.2 y Robolectric 4.17; no entran en release.

Ejecutar solo pruebas debug: `gradlew.bat :app:testDebugUnitTest --tests com.fenice.geofieldgps.LocationMotionTelemetryTest --console=plain`. No ejecutar assembleRelease/bundleRelease.

Resultado: 10 pruebas aprobadas, 0 fallos y compilación debug correcta mediante testDebugUnitTest. Solo se compilaron clases/recursos necesarios para las pruebas; no se generó un APK/AAB release ni se instaló nada. Avisos de Gradle existentes, sin errores.

## Diagnóstico local de disponibilidad GPS

Se añade [LOCATION_DIAGNOSTIC] por ubicación recibida, solo con BuildConfig.DEBUG. Incluye proveedor, antigüedad calculada con reloj monotónico, hasAccuracy/accuracy, hasSpeed/speed y hasBearing/bearing. Una antigüedad ausente o incoherente se informa como unknown. No incluye identidad, tokens ni coordenadas. No cambia payload, frecuencia, deduplicado, recuperación ni cola offline. El proveedor fused identifica el proveedor combinado, no permite distinguir por sí solo si el origen interno fue GNSS o red. El diagnóstico aún requiere un nuevo APK debug para observarlo en el teléfono; no se instala ni se publica en este paso.

## Recuperación según intervalo — cambio local

Watchdog y recuperación por pantalla usan el mismo umbral: dos intervalos configurados más 30 segundos de tolerancia, con intervalo mínimo de un minuto. Para frecuencia de un minuto: 150 segundos; para cinco minutos: 630 segundos. Se conserva la recuperación cuando no se han iniciado actualizaciones y el cooldown de 30 segundos. No cambia adquisición, filtros, payload, cola ni firma. El umbral detecta falta de callbacks, no demuestra fallo GNSS: la distancia mínima puede limitar callbacks estando detenido. No garantiza disponibilidad de speed/heading. Pruebas cubren intervalos de uno y cinco minutos, intervalo inválido y máximo de preferencias. Requiere un nuevo APK para probar el cambio en teléfono; sin instalación ni publicación en este paso.

### Verificación debug en teléfono

14 pruebas aprobadas y assembleDebug correcto. Actualización con adb install -r del paquete com.fenice.geofieldgps.preview, versión 17, certificado SHA-256 10e76827e4cc3edba8aca683e38a5150e3be86bd35a3292b5bcc1d9d29164adb igual al instalado. Instalado el 09/10/2026 12:39 Ecuador; primera instalación permanece 07/10/2026 17:26:46. Logcat muestra watchdog saludable a 57,7, 87,7 y 117,7 segundos sin callbacks, sin recuperación prematura. No se comprobó aún la recuperación efectiva por encima de 150 segundos ni una caminata con esta versión. Ubicación Fused de 83 ms de antigüedad sin speed/bearing confirma ausencia desde proveedor en esa muestra. Filtro temporal de registros restaurado. Sin commit, push ni publicación.

### Prueba estacionaria del umbral

Móvil inmóvil conectado por USB. A las 12:44:33 Ecuador, watchdog detectó exactamente 150000 ms sin callbacks, volvió a registrar la solicitud y recibió callback Fused 18 ms después. La ubicación tenía 21412 ms de antigüedad, accuracy reportada 11.457 m y hasSpeed/hasBearing false. Confirma el umbral y re-registro, pero no una adquisición GNSS nueva ni mayor disponibilidad de movimiento. Ausencia de callbacks con distancia mínima de 10 m puede ser normal estando detenido; el watchdog aún no distingue este caso de fallo. Filtro temporal de logs restaurado. No se alteró frecuencia ni payload durante la prueba.

## Solicitud estacionaria — cambio local

La solicitud Fused pasa de distancia mínima de 10 m a 0 m. Permite recibir ubicaciones estando inmóvil para que el watchdog no dependa del desplazamiento. Se conservan intervalo, mínimo de 5 s, prioridad alta, umbral de recuperación y cola. Android sigue controlando entrega: no garantiza cadencia ni telemetría de movimiento. El deduplicado existente elimina similares dentro de 15 s y conserva mejores precisiones; conserva también posiciones estacionarias posteriores, por lo que pueden aumentar envíos y consumo respecto al filtro de distancia previo. Pruebas llaman al constructor real de solicitud y deduplicado. Pendiente generar APK y validar en teléfono; sin instalación en este paso.

### Verificación estacionaria con distancia mínima cero

17 pruebas aprobadas y assembleDebug correcto. Actualización Preview con firma coincidente y adb install -r a las 12:48:29 Ecuador; primera instalación conservada. Móvil inmóvil: callbacks recientes a las 12:48:34.565, 12:49:33.754 y 12:50:36.454 (separación 59.2 y 62.7 s). Antigüedad 85, 116 y 133 ms. Los dos últimos reportan speed=0 y bearing no disponible. Watchdog saludable durante observación hasta 12:51:02, sin recuperación registrada en el proceso nuevo. Filtro temporal de registros restaurado. La observación no mide consumo, no valida movimiento y no garantiza todos los dispositivos. Sin commit, push ni publicación.

## Archivo reproducible en repo web Preview

Cambios conservados siguiendo la convención existente en [docs/android-patches/motion-telemetry-preview](android-patches/motion-telemetry-preview/README.md): parche de servicio y Gradle más tres archivos de pruebas. git apply --check y aplicación en copia de los archivos base verificaron que el parche reproduce exactamente ambos archivos probados, normalizando únicamente fin de línea para la comparación. README incluye hashes de la base. No se creó repo Android ni se copiaron claves, firma, APK, configuración local o fuentes completas. Esto permite un futuro commit limitado del parche, pruebas y docs en preview; no sustituye versionado completo de Android. Sin commit ni push.
