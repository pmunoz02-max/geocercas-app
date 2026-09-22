# Sistema de Geocercas

Permite definir zonas geográficas para control de actividad.

## Tecnología

- Leaflet
- Leaflet-Geoman

## Flujo

```
Usuario dibuja polígono
  ↓
se guarda en tabla geofences
  ↓
se activa o desactiva
```

## Usos

- control de presencia
- asignaciones
- análisis territorial

## API y acceso

La ruta `/geocerca` utiliza la capa `geofencesApi` para todas las operaciones de lectura y escritura.

> La UI no accede directamente a la tabla `geofences`, sino que siempre pasa por la API (`geofencesApi`). Esto permite aplicar reglas de negocio, validaciones y control de acceso centralizado.
## Edición de vértices — corrección Preview
Las figuras GeoJSON de borrador y visualización estaban en panes 650/640, por encima del markerPane de Leaflet (600) usado por los vértices de Geoman. Se sitúan ahora en 450/440, debajo de los controles de vértice. Editar vértices y arrastrar la figura completa se desactivan mutuamente. El marcador de centro queda excluido de Geoman. El guardado de un borrador lee la geometría viva de Leaflet, incluyendo modificaciones, en vez de las coordenadas originales de React. No cambia tablas ni reglas de cupo.

### Regresión de los botones corregida
Se retiran los listeners globaleditmodetoggled/globaldragmodetoggled añadidos en ab4aedb7. Llamaban a disableGlobalDragMode/disableGlobalEditMode después de activar el otro modo y deshabilitaban la capa recién activada. La barra nativa Geoman ya realiza la alternancia. Prueba con Leaflet y Geoman reales: clic editar → vértices activos → clic arrastrar → arrastre activo → clic editar → edición activa. La misma prueba falla con los listeners anteriores y pasa sin ellos. Se conservan la corrección de panes y el guardado de geometría viva. La prueba usa DOM simulado, no acredita hit-testing visual en navegador.

### Creación punto por punto
Se ocultan cortar (cutPolygon) y eliminar (removalMode) de la barra Geoman. Se añade Dibujar por vértices al panel: activa Polygon, admite 3 o más puntos y cierra al pulsar el primer vértice; después se usa Guardar geocerca. Respeta el permiso/cupo de creación. No cambia el botón existente de eliminar geocercas guardadas del listado.
