// src/components/tracker/TrackerMap.jsx
// Mapa robusto para visualizar geocercas y posiciones de trackers en el dashboard.
// FIX universal Feb-2026:
// - Fuerza height real por inline style (evita contenedor 0px en prod)
// - invalidateSize() al montar y en delays (layout grids/flex/tabs)
// - Normalización GeoJSON más tolerante (Polygon / MultiPolygon / Feature / FC / arrays)
// - No depende de GeoJSON layer (usa Polygon) para evitar crash por shapes raros

import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, useMap } from "react-leaflet";
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

function isFiniteNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

// Convierte distintas formas de coordenadas en [lat, lng]
function toLatLng(coord) {
  if (!coord) return null;

  // GeoJSON: [lng, lat]
  if (Array.isArray(coord) && coord.length >= 2) {
    const a = Number(coord[0]);
    const b = Number(coord[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

    // GeoJSON típico [lng,lat]
    if (Math.abs(a) <= 180 && Math.abs(b) <= 90) return [b, a];
    // fallback [lat,lng]
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return [a, b];

    return null;
  }

  // Objeto { lat, lng }
  if (typeof coord === "object" && coord !== null) {
    const lat = Number(coord.lat);
    const lng = Number(coord.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  }

  return null;
}

// Normaliza un único objeto GeoJSON (Feature, FeatureCollection, geometry)
function normalizeGeoJSONToPolygons(obj) {
  const polygons = [];
  if (!obj) return polygons;

  const processPolygonCoords = (coords) => {
    if (!coords) return;

    // Polygon: [ [ [lng,lat], ... ] ]
    // MultiPolygon: [ [ [ [lng,lat], ... ] ], ... ]
    if (!Array.isArray(coords) || coords.length === 0) return;

    // MultiPolygon detect: coords[0][0][0] es array
    const isMulti = Array.isArray(coords?.[0]?.[0]?.[0]);

    if (isMulti) {
      // MultiPolygon
      coords.forEach((poly) => {
        const ring = poly?.[0];
        if (!Array.isArray(ring)) return;
        const polyLatLng = ring.map(toLatLng).filter(Boolean);
        if (polyLatLng.length > 2) polygons.push(polyLatLng);
      });
    } else {
      // Polygon
      const ring = coords?.[0];
      if (!Array.isArray(ring)) return;
      const polyLatLng = ring.map(toLatLng).filter(Boolean);
      if (polyLatLng.length > 2) polygons.push(polyLatLng);
    }
  };

  const handleGeometry = (g) => {
    if (!g || typeof g !== "object") return;
    if (g.type === "Polygon" || g.type === "MultiPolygon") {
      processPolygonCoords(g.coordinates);
    }
  };

  if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
    obj.features.forEach((f) => handleGeometry(f?.geometry));
    return polygons;
  }

  if (obj.type === "Feature" && obj.geometry) {
    handleGeometry(obj.geometry);
    return polygons;
  }

  // geometry directo
  handleGeometry(obj);
  return polygons;
}

// Acepta: GeoJSON, string JSON, array coords, array de {lat,lng}, etc.
function normalizeGeofenceToPolygons(input) {
  const result = [];
  if (!input) return result;

  // Si es string, intenta parsear JSON
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return normalizeGeofenceToPolygons(parsed);
    } catch {
      return result;
    }
  }

  // GeoJSON
  if (typeof input === "object" && input?.type) {
    return normalizeGeoJSONToPolygons(input);
  }

  // Array de coords
  if (Array.isArray(input)) {
    // Caso: un solo polígono como array de coords
    const maybePolygon = input.every((c) => Array.isArray(c) || (c && typeof c === "object" && "lat" in c && "lng" in c));
    if (maybePolygon) {
      const poly = input.map(toLatLng).filter(Boolean);
      if (poly.length > 2) result.push(poly);
      return result;
    }

    // Array de items: mezclar GeoJSON / rings / etc.
    input.forEach((item) => {
      if (!item) return;
      if (typeof item === "string") {
        try {
          const parsed = JSON.parse(item);
          result.push(...normalizeGeofenceToPolygons(parsed));
        } catch {
          // ignore
        }
        return;
      }
      if (typeof item === "object" && item?.type) {
        result.push(...normalizeGeoJSONToPolygons(item));
        return;
      }
      // fallback: intenta tratar item como ring
      const ring = Array.isArray(item) ? item : [item];
      const poly = ring.map(toLatLng).filter(Boolean);
      if (poly.length > 2) result.push(poly);
    });

    return result;
  }

  return result;
}

// -------------------------------------------------------------
// Fix universal: invalidateSize al montar
// -------------------------------------------------------------
function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;

    // Layouts con grid/flex suelen necesitar varios invalidates
    const doIt = () => {
      try { map.invalidateSize(); } catch {}
    };

    doIt();
    const t1 = setTimeout(doIt, 0);
    const t2 = setTimeout(doIt, 250);
    const t3 = setTimeout(doIt, 1000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [map]);

  return null;
}

// -------------------------------------------------------------
// Componente principal
// -------------------------------------------------------------

export default function TrackerMap({
  geofences = [],
  positions = [],
  center = null,
  zoom = 15,
  className = "",
}) {
  const mapRef = useRef(null);

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
        const lat = Number(p?.lat);
        const lng = Number(p?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const recordedDate = p.recorded_at ? new Date(p.recorded_at) : p.recorded_date ? new Date(p.recorded_date) : null;
          return { ...p, latLng: [lat, lng], recordedDate };
        }
        return null;
      })
      .filter(Boolean);
  }, [positions]);

  const groupedByTracker = useMemo(() => {
    const groups = new Map();
    markerPositions.forEach((p) => {
      const key = p.user_id || p.label || "tracker";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });

    const entries = Array.from(groups.entries()).map(([key, pts]) => {
      pts.sort((a, b) => (a.recordedDate?.getTime() || 0) - (b.recordedDate?.getTime() || 0));
      return { trackerId: key, points: pts };
    });

    return entries;
  }, [markerPositions]);

  const computedCenter = useMemo(() => {
    if (Array.isArray(center) && center.length >= 2) {
      const lat = Number(center[0]);
      const lng = Number(center[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    }

    if (polygons.length > 0 && polygons[0].length > 0) return polygons[0][0];
    if (markerPositions.length > 0) return markerPositions[0].latLng;

    return [-0.22985, -78.52495]; // Quito
  }, [center, polygons, markerPositions]);

  // SIEMPRE forzar tamaño por inline style (por si Tailwind/clases fallan)
  const containerStyle = {
    width: "100%",
    height: "480px",
    minHeight: "360px",
  };

  const containerClass =
    className || "w-full rounded-lg border border-slate-300 overflow-hidden";

  return (
    <div className={containerClass} style={containerStyle}>
      <MapContainer
        center={computedCenter}
        zoom={zoom}
        style={{ width: "100%", height: "100%" }}
        scrollWheelZoom={true}
        whenCreated={(map) => {
          mapRef.current = map;
          // invalidate inmediato por si entra en layout aún no calculado
          try { map.invalidateSize(); } catch {}
          setTimeout(() => { try { map.invalidateSize(); } catch {} }, 0);
        }}
      >
        <InvalidateOnMount />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Geocercas */}
        {polygons.map((poly, idx) => (
          <Polygon key={`poly-${idx}`} positions={poly} pathOptions={{ weight: 2 }} />
        ))}

        {/* Trackers: rutas + puntos */}
        {groupedByTracker.map(({ trackerId, points }, index) => {
          const color = TRACKER_COLORS[index % TRACKER_COLORS.length];
          const latlngs = points.map((p) => p.latLng);

          return (
            <React.Fragment key={trackerId}>
              {latlngs.length > 1 && (
                <Polyline positions={latlngs} pathOptions={{ color, weight: 3 }} />
              )}

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
