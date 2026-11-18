# Inicio: acceso a todos los módulos
Fecha: 2026-11-10. Rama: preview.

Inicio presenta un directorio adaptable de tarjetas con iconos, descripción y enlaces con idioma ES/EN/FR. Los grupos son operación en campo, planificación/análisis y cuenta/recursos. Reemplaza el bloque limitado de cinco pasos y reduce la cabecera; conserva ayuda y gestión de cuenta.

ProtectedShell entrega sus navigationTabs mediante Outlet context. HomeModules consume exactamente esa lista, excepto Inicio, para preservar las condiciones actuales de rol, administración y disponibilidad de Incidencias. No se alteran rutas, permisos, datos ni activación de módulos opcionales.

Inicio destaca Incidencias bajo la cabecera. En el dominio de Preview, si las pestañas de la organización incluyen Mapa de incidencias, se muestran el acceso al mapa y las instrucciones para consultar el gráfico de barras, la línea de estado y registrar medidas. La tarjeta enlaza al módulo, a la guía web, a la guía completa en PDF y al video del idioma activo. Los PDF y MP4 de esta edición están en `public/resources/preview-nov2026/`.

Validar navegación de cada tarjeta, idioma conservado, diseño móvil y ausencia de enlaces administrativos cuando no figuran en las pestañas. Producción requiere Promote explícito.
