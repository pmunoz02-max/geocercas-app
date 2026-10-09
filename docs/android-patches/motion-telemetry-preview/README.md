# Android Preview: telemetría y continuidad estacionaria

Paquete archivado en el repo web siguiendo docs/android-patches; Android original permanece en su carpeta independiente. No crea repositorio Android ni modifica Producción.

Aplicar únicamente a geocercas-twa-preview con applicationId com.fenice.geofieldgps.preview y endpoints preview.tugeocercas.com. El parche usa como base los archivos respaldados antes de estos cambios; no aplicarlo encima de la versión ya modificada e instalada.

Contenido: un parche de ForegroundLocationService.kt y app/build.gradle, más tres archivos de pruebas. No contiene configuración de firma, claves, local.properties, APK ni datos del teléfono. El parche conserva contexto de la configuración Gradle con nombres de variables, sin valores de credenciales.

Antes de aplicar en una copia de la base, comprobar git apply --check android-motion-preview.patch desde la raíz Android. Si falla, detenerse y revisar la base; no forzar. Tras aplicarlo, copiar los tres archivos tests/*.kt a app/src/test/java/com/fenice/geofieldgps, comprobando cualquier archivo existente antes de sustituirlo.

Verificación: gradlew.bat :app:testDebugUnitTest --tests com.fenice.geofieldgps.LocationMotionTelemetryTest --tests com.fenice.geofieldgps.LocationRecoveryTimeoutTest --tests com.fenice.geofieldgps.StationaryLocationRequestTest --console=plain. Resultado registrado: 17 pruebas, cero fallos. APK debug instalado y probado estacionario y en caminata; ver ../../2026-10-09-android-motion-telemetry-preview.md para alcance y limitaciones. No build release ni publicación.

Sin commit ni push. Este archivo conserva un parche incremental, no constituye un respaldo completo de todo el proyecto Android.

SHA-256 de los archivos base:
app/src/main/java/com/fenice/geofieldgps/ForegroundLocationService.kt: E7AD2059F749AB844C59237B88A5C35A8A291D522563AEF898F1D4D84270F4CB
app/build.gradle: E4851DA8194BD93D8DD8EC7D472E55A013958E6109225EACEF2F215DB4B88FE4
