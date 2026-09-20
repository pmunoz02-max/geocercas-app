# Manual rápido GeoField GPS

La tarjeta PDF de `/recursos`, `/resources` y `/ressources` ofrece visualización
(en otra pestaña) y descarga nativa del archivo del idioma actual ES/EN/FR.
Los PDF públicos están en `public/resources/geofield-gps-manual-{lang}.pdf`.
No contienen datos personales, tokens ni enlaces de invitación.

Cada manual tiene cuatro páginas: preparación del administrador, activación Android,
verificación móvil/dashboard y solución de problemas. Distingue el estado local activo
frente a la recepción real de una posición y advierte sobre enlaces reemplazados.

Fuente editorial reproducible: `scripts/build_quick_manual.py` (Python + reportlab).
Regeneración: `python scripts/build_quick_manual.py public/resources`.
No se requiere Python ni generación de PDF durante el build o en el navegador.
Actualizar la edición y la metadata de ResourcesPage al revisar el contenido.

Fuentes funcionales revisadas: InvitarTracker.jsx, TrackerInviteStart.jsx,
TrackerInstall.jsx, TrackerGpsPage.jsx y la guía de instrucciones existente.
Recursos conserva solo Manual PDF y Guía de reportes. Se retiran la presentación,
el vídeo y la guía tracker por solapamiento con el manual y falta de contenido;
la guía de geocercas se retira porque aún no existe. El contenido futuro se podrá
incorporar cuando aporte una función distinta y esté disponible. La cuadrícula usa
dos columnas en escritorio y una en móvil. No cambia auth, planes,
tracking ni base de datos. Producción requiere Promote explícito desde Preview.

Control editorial: doce páginas renderizadas e inspeccionadas; sin solapamientos.

Validación: build Vite OK; tarjeta revisada en ES/EN/FR; tres archivos con HTTP 200, application/pdf y firma %PDF-, cuatro páginas por idioma.
