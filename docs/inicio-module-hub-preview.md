# Inicio: acceso a todos los módulos
Fecha: 2026-11-10. Rama: preview.

Inicio presenta un directorio adaptable de tarjetas con iconos, descripción y enlaces con idioma ES/EN/FR. Los grupos son operación en campo, planificación/análisis y cuenta/recursos. Reemplaza el bloque limitado de cinco pasos y reduce la cabecera; conserva ayuda y gestión de cuenta.

ProtectedShell entrega sus navigationTabs mediante Outlet context. HomeModules consume exactamente esa lista, excepto Inicio, para preservar las condiciones actuales de rol, administración y disponibilidad de Incidencias. No se alteran rutas, permisos, datos ni activación de módulos opcionales.

Validar navegación de cada tarjeta, idioma conservado, diseño móvil y ausencia de enlaces administrativos cuando no figuran en las pestañas. Producción requiere Promote explícito.
