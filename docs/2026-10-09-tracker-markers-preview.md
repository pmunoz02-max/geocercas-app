# Marcadores GPS en Preview — 2026-10-09

AnimatedTrackerDot se extrae a src/components/AnimatedTrackerDot.jsx. Utiliza un Marker de Leaflet con pin GPS opaco en markerPane, borde blanco y sombra: verde online, ámbar stale, gris offline. Conserva interpolación y salto inmediato para desplazamientos de más de 250 m. Nombres tratados como texto, identificables con teclado, cursor y toque.

Las etiquetas permanentes evitan otros pines y etiquetas según coordenadas proyectadas, se recalculan al mover/zoomear/redimensionar y se omiten para más de 12 trackers. Un tracker seleccionado conserva su nombre. Las etiquetas no cambian el encuadre.

Selección, búsqueda y estado producen visibleTrackerRows, compartido por tabla, contadores y marcadores. El estado sigue disponible al seleccionar un tracker. Las trayectorias conservan puntos, orden y colores por tracker y solo se dibujan para trackers visibles con coordenadas válidas. Un tracker sin posición válida permanece en la tabla y no genera un pin artificial en 0,0. La posición del pin individual proviene de la misma última posición que la tabla. Sin cambios en consultas ni Supabase.

Verificación: pruebas de filtros, coordenadas, colisión de nombres, trayectorias, pines reales de React Leaflet y regresiones de encuadre manual; build de Vite. Validación local: 31 pruebas aprobadas y build correcto. Publicación limitada a branch preview.
