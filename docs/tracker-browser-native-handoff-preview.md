# Navegador externo y seguimiento Android — Preview

2026-09-09. Chrome/Gmail no exponen AndroidBridge/Android. TrackerGpsPage ahora muestra sesión preparada pero seguimiento detenido cuando falta el puente; oculta los controles nativos y evita solicitar geolocalización del navegador durante ese intento. Un objeto puente sin métodos de inicio no se considera inicio válido. ES/EN/FR actualizados.

Inspección del árbol local geocercas-twa: AndroidManifest.xml registra HTTPS app.tugeocercas.com y esquema geocercas://tracker. WebViewActivity.java transforma ese esquema a https://app.tugeocercas.com/tracker-open. Por eso no se añade un enlace de apertura que envíe sesiones Preview hacia producción. La versión instalada en el teléfono no pudo inspeccionarse; estas conclusiones se refieren al código local. El árbol Android no es un repositorio Git disponible en esa ubicación.

Pendiente para apertura real: disponer de una variante Android Preview con origen/API y enlaces verificados de Preview, instalarla y comprobar el enlace desde Gmail/Chrome. Este commit web no resuelve ese requisito nativo ni demuestra que el servicio GPS arrancó en un dispositivo.

Validación: 2 pruebas de UI aprobadas (sin puente; puente sin método de inicio), build Vite correcto. Solo commit/push web a preview, sin cambios Android ni producción.

## Botón de apertura en Preview

2026-10-07. TrackerGpsPage muestra el botón "Abrir GeoField GPS Preview" únicamente cuando needsNativeApp es true y window.location.hostname es preview.tugeocercas.com. En app.tugeocercas.com y cualquier otro host el botón no se renderiza, así que el flujo de Producción no cambia.

Al pulsarlo se navega a geocercas-preview://tracker con estos tres parámetros, codificados con URLSearchParams y tomados de runtimeSession:

- tracker_runtime_token (runtimeSession.runtimeToken)
- tracker_user_id (runtimeSession.trackerUserId)
- org_id (runtimeSession.orgId)

Formato (valores de ejemplo, no reales): geocercas-preview://tracker?tracker_runtime_token=<token>&tracker_user_id=<uuid>&org_id=<uuid>

La sesión no se borra ni se modifica al pulsar el botón. Textos i18n en ES/EN/FR bajo la clave tracker.gps.openPreviewApp.

Lado Android (variante Preview en geocercas-twa): buildType preview con applicationIdSuffix .preview, manifestPlaceholders appHost=preview.tugeocercas.com y trackerLinkScheme=geocercas-preview, y BuildConfig.BASE_URL/APP_HOST/TRACKER_LINK_SCHEME apuntando a Preview.

Pendiente: la prueba en dispositivo no se ha realizado. Falta instalar la variante Preview y comprobar que el botón abre la app, que WebViewActivity consume tracker_runtime_token, tracker_user_id y org_id desde geocercas-preview://tracker, y que el servicio GPS arranca. Hasta entonces esta funcionalidad no está validada de extremo a extremo.
