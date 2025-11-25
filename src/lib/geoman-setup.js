// src/lib/geoman-setup.js
// Helper mínimo, estable y compatible con Leaflet-Geoman

import L from 'leaflet';

/**
 * Activa opciones sensatas de Geoman y eventos comunes.
 * Se asume que el plugin ya está cargado (map.pm existe).
 */
export function setupGeoman(map, featureGroup) {
  if (!map?.pm) return;

  // Opciones globales por defecto
  map.pm.setGlobalOptions({
    continueDrawing: false,
    snappable: true,
    snapDistance: 20,
    templineStyle: { color: '#0ea5e9' },
    hintlineStyle: { color: '#0ea5e9', dashArray: [2, 8] },
  });

  // Asegura que las capas creadas se añadan a featureGroup
  map.on('pm:create', (e) => {
    const layer = e.layer;
    if (featureGroup && !featureGroup.hasLayer(layer)) {
      featureGroup.addLayer(layer);
    }
  });

  // Opcional: terminar modos de dibujo al presionar ESC
  map.on('keyup', (e) => {
    if (e.originalEvent?.key === 'Escape') map.pm.disableDraw();
  });
}

/**
 * Devuelve un FeatureCollection GeoJSON con TODO lo contenido en featureGroup.
 */
export function collectGeomanAsFeatureCollection(featureGroup) {
  const features = [];
  featureGroup?.eachLayer((layer) => {
    try {
      const gj = layer.toGeoJSON();
      if (Array.isArray(gj)) {
        gj.forEach((f) => features.push(f));
      } else if (gj && gj.type) {
        if (gj.type === 'FeatureCollection' && gj.features) {
          features.push(...gj.features);
        } else {
          features.push(gj);
        }
      }
    } catch (_) { /* noop */ }
  });
  return { type: 'FeatureCollection', features };
}

/**
 * Calcula bounds (LatLngBounds) a partir de un Feature/FeatureCollection/Geometry.
 */
export function boundsFromFeature(geojson) {
  try {
    const layer = L.geoJSON(geojson);
    const b = layer.getBounds();
    return b && b.isValid() ? b : null;
  } catch (_) {
    return null;
  }
}
