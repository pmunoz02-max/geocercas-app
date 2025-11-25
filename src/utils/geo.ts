// src/utils/geo.ts

export type LatLng = { lat: number; lng: number };

/** De texto "lat, lng" por línea => GeoJSON Polygon */
export function polygonFromText(text: string) {
  // Cada línea: "-0.064778, -78.479860"
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const coordsLatLng = lines.map(l => {
    const parts = l.split(',').map(s => s.trim());
    if (parts.length < 2) throw new Error(`Línea inválida: "${l}"`);
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      throw new Error(`No numérico: "${l}"`);
    }
    return { lat, lng };
  });

  return polygonFromLatLngArray(coordsLatLng);
}

/** De array Leaflet [{lat,lng},...] => GeoJSON Polygon */
export function polygonFromLatLngArray(points: LatLng[]) {
  if (!points || points.length < 3) {
    throw new Error('Se requieren al menos 3 puntos para un polígono');
  }

  // GeoJSON exige [lng, lat] y anillo cerrado
  const ring: [number, number][] = points.map(p => [toNum(p.lng), toNum(p.lat)]);

  // Cierra el anillo si hace falta
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }

  // Validaciones básicas
  if (ring.length < 4) {
    throw new Error('El anillo debe tener al menos 4 vértices (incluyendo el cierre)');
  }

  // Construye GeoJSON Geometry (no Feature)
  const geometry = {
    type: 'Polygon' as const,
    coordinates: [ring],
  };

  return geometry;
}

function toNum(x: any): number {
  const n = typeof x === 'string' ? parseFloat(x) : x;
  if (Number.isNaN(n)) throw new Error('Coordenada no numérica');
  return n;
}
