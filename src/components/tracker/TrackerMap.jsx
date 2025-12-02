// src/components/tracker/TrackerMap.jsx
// Mapa para visualizar geocercas y posiciones de trackers en el dashboard.
// Acepta geocercas en formato GeoJSON o arrays de coordenadas,
// y posiciones como array de { lat, lng, user_id?, label?, recorded_at? }.

import React, { useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  CircleMarker,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Paleta de colores para trackers
const TRACKER_COLORS = [
  "#007AFF", // azul
  "#FF3B30", // rojo
  "#34C759", // verde
  "#FF9500", // naranja
  "#AF52DE", // púrpura
  "#5856D6", // índigo
  "#FF2D55", // rosa fuerte
];

// -------------------------------------------------------------
// Helpers de normalización
// -------------------------------------------------------------

// Convierte distintas formas de coordenadas en [lat, lng]
function toLatLng(coord) {
  if (!coord) return null;

  // GeoJSON: [lng, lat]
  if (Array.isArray(coord) && coord.length >= 2) {
    const [a, b] = coord;
    // Suponemos formato [lng, lat] (GeoJSON)
    if (Math.abs(a) <= 180 && Math.abs(b) <= 90) {
      return [b, a];
    }
    // fallback por si alguien ya pasó [lat, lng]
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
      return [a, b];
    }
    return null;
  }

  // Objeto { lat, lng }
  if (typeof coord === "object" && coord !== null) {
    if (typeof coord.lat === "number" && typeof coord.lng === "number") {
      return [coord.lat, coord.lng];
    }
  }

  return null;
}

// Normaliza un único objeto GeoJSON (Feature, FeatureCollection, geometry)
function normalizeGeoJSONToPolygons(obj) {
  const polygons = [];

  if (!obj) return polygons;

  const processCoords = (coords) => {
    if (!coords) return;
    // Polygon: [ [ [lng,lat], ... ] ]
    // MultiPolygon: [ [ [ [lng,lat], ... ] ], ... ]
    if (
      Array.isArray(coords) &&
      coords.length > 0 &&
      Array.isArray(coords[0]) &&
      Array.isArray(coords[0][0])
    ) {
      // Podría ser Polygon o MultiPolygon
      // Detectar un nivel adicional
      if (Array.isArray(coords[0][0][0])) {
        // MultiPolygon
        coords.forEach((poly) => {
          if (Array.isArray(poly) && poly.length > 0) {
            const ring = poly[0];
            const polyLatLng = ring
              .map((c) => toLatLng(c))
              .filter((p) => p !== null);
            if (polyLatLng.length > 2) {
              polygons.push(polyLatLng);
            }
          }
        });
      } else {
        // Polygon
        const ring = coords[0];
        const polyLatLng = ring
          .map((c) => toLatLng(c))
          .filter((p) => p !== null);
        if (polyLatLng.length > 2) {
          polygons.push(polyLatLng);
        }
      }
    }
  };

  if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
    obj.features.forEach((f) => {
      if (!f || !f.geometry) return;
      const g = f.geometry;
      if (g.type === "Polygon" || g.type === "MultiPolygon") {
        processCoords(g.coordinates);
      }
    });
  } else if (obj.type === "Feature" && obj.geometry) {
    const g = obj.geometry;
    if (g.type === "Polygon" || g.type === "MultiPolygon") {
      processCoords(g.coordinates);
    }
  } else if (obj.type === "Polygon" || obj.type === "MultiPolygon") {
    processCoords(obj.coordinates);
  }

  return polygons;
}

// Acepta: GeoJSON, array de coords, array de {lat,lng}, etc.
function normalizeGeofenceToPolygons(input) {
  const result = [];

  if (!input) return result;

  // Ya es array de arrays lat,lng
  if (Array.isArray(input)) {
    const maybePolygon = input.every(
      (c) =>
        Array.isArray(c) ||
        (typeof c === "object" &&
          c !== null &&
          typeof c.lat === "number" &&
          typeof c.lng === "number")
    );

    if (maybePolygon) {
      const poly = input.map((c) => toLatLng(c)).filter((p) => p !== null);
      if (poly.length > 2) result.push(poly);
      return result;
    }

    // Array heterogéneo, intentar por partes
    input.forEach((item) => {
      if (!item) return;
      if (item.type && typeof item.type === "string") {
        result.push(...normalizeGeoJSONToPolygons(item));
      } else {
        const poly = [item]
          .flat()
          .map((c) => toLatLng(c))
          .filter((p) => p !== null);
        if (poly.length > 2) result.push(poly);
      }
    });

    return result;
  }

  // Probablemente GeoJSON: Feature / FeatureCollection / geometry
  if (typeof input === "object" && input.type) {
    return normalizeGeoJSONToPolygons(input);
  }

  return result;
}

// -------------------------------------------------------------
// Componente principal
// -------------------------------------------------------------

/**
 * TrackerMap
 *
 * Props:
 * - geofences: GeoJSON | array de geocercas | array de coords
 * - positions: array de { lat, lng, user_id?, label?, recorded_at? }
 * - center: [lat, lng] opcional
 * - zoom: number (default 15)
 * - className: string opcional para el contenedor
 */
export default function TrackerMap({
  geofences = [],
  positions = [],
  center = null,
  zoom = 15,
  className = "",
}) {
  const polygons = useMemo(() => {
    if (!geofences) return [];
    if (Array.isArray(geofences)) {
      return geofences.flatMap((g) => normalizeGeofenceToPolygons(g));
    }
    return normalizeGeofenceToPolygons(geofences);
  }, [geofences]);

  const markerPositions = useMemo(() => {
    if (!positions) return [];
    return positions
      .map((p) => {
        if (typeof p.lat === "number" && typeof p.lng === "number") {
          const recordedDate = p.recorded_at
            ? new Date(p.recorded_at)
            : p.recorded_date || null;
          return {
            ...p,
            latLng: [p.lat, p.lng],
            recordedDate,
          };
        }
        return null;
      })
      .filter((x) => x !== null);
  }, [positions]);

  // Agrupar por tracker (user_id o label)
  const groupedByTracker = useMemo(() => {
    const groups = new Map();
    markerPositions.forEach((p) => {
      const key = p.user_id || p.label || "tracker";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });

    // Ordenar cronológicamente cada grupo
    const entries = Array.from(groups.entries()).map(([key, pts]) => {
      pts.sort((a, b) => {
        const ta = a.recordedDate?.getTime() || 0;
        const tb = b.recordedDate?.getTime() || 0;
        return ta - tb;
      });
      return { trackerId: key, points: pts };
    });

    return entries;
  }, [markerPositions]);

  // Centro del mapa:
  // 1) center prop
  // 2) primer polígono
  // 3) primer marker
  // 4) Quito por defecto
  const computedCenter = useMemo(() => {
    if (Array.isArray(center) && center.length >= 2) return center;

    if (polygons.length > 0 && polygons[0].length > 0) {
      return polygons[0][0];
    }

    if (markerPositions.length > 0) {
      return markerPositions[0].latLng;
    }

    return [-0.22985, -78.52495]; // Quito
  }, [center, polygons, markerPositions]);

  const containerClass =
    className ||
    "w-full h-96 rounded-lg border border-slate-300 overflow-hidden";

  return (
    <div className={containerClass}>
      <MapContainer
        center={computedCenter}
        zoom={zoom}
        style={{ width: "100%", height: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Geocercas */}
        {polygons.map((poly, idx) => (
          <Polygon key={`poly-${idx}`} positions={poly} pathOptions={{ weight: 2 }} />
        ))}

        {/* Trackers: puntos + rutas por color */}
        {groupedByTracker.map(({ trackerId, points }, index) => {
          const color = TRACKER_COLORS[index % TRACKER_COLORS.length];
          const latlngs = points.map((p) => p.latLng);

          return (
            <React.Fragment key={trackerId}>
              {/* Ruta cronológica */}
              {latlngs.length > 1 && (
                <Polyline
                  positions={latlngs}
                  pathOptions={{ color, weight: 3 }}
                />
              )}

              {/* Puntos */}
              {points.map((p, idxPoint) => {
                const isLast = idxPoint === points.length - 1;
                return (
                  <CircleMarker
                    key={`${trackerId}-${idxPoint}`}
                    center={p.latLng}
                    radius={isLast ? 7 : 5}
                    pathOptions={{
                      color,
                      fillColor: color,
                      weight: isLast ? 2 : 1,
                      fillOpacity: 0.9,
                    }}
                  />
                );
              })}
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
