# Navegador externo y seguimiento Android — Preview

2026-09-09. Chrome/Gmail no exponen AndroidBridge/Android. TrackerGpsPage ahora muestra sesión preparada pero seguimiento detenido cuando falta el puente; oculta los controles nativos y evita solicitar geolocalización del navegador durante ese intento. Un objeto puente sin métodos de inicio no se considera inicio válido. ES/EN/FR actualizados.

Inspección del árbol local geocercas-twa: AndroidManifest.xml registra HTTPS app.tugeocercas.com y esquema geocercas://tracker. WebViewActivity.java transforma ese esquema a https://app.tugeocercas.com/tracker-open. Por eso no se añade un enlace de apertura que envíe sesiones Preview hacia producción. La versión instalada en el teléfono no pudo inspeccionarse; estas conclusiones se refieren al código local. El árbol Android no es un repositorio Git disponible en esa ubicación.

Pendiente para apertura real: disponer de una variante Android Preview con origen/API y enlaces verificados de Preview, instalarla y comprobar el enlace desde Gmail/Chrome. Este commit web no resuelve ese requisito nativo ni demuestra que el servicio GPS arrancó en un dispositivo.

Validación: 2 pruebas de UI aprobadas (sin puente; puente sin método de inicio), build Vite correcto. Solo commit/push web a preview, sin cambios Android ni producción.
