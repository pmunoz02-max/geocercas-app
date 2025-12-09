// src/components/GeoMap.jsx
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import {
  createGeocerca,
  updateGeocerca,
  deleteGeocerca,
} from "@/services/geocercas";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * safeParseJSON "blindado":
 * - Si es objeto/array ya parseado, lo devuelve tal cual.
 * - Si es string, intenta JSON.parse normal.
 * - Si falla:
 *    a) intenta extraer un objeto que empiece en {"type"...} (para Feature/Geometry).
 *    b) intenta extraer el primer array JSON [ ... ] (para polygon).
 */
function safeParseJSON(input, label = "JSON") {
  if (!input) return null;

  // Si ya es objeto/array, lo usamos tal cual
  if (typeof input === "object") return input;

  if (typeof input !== "string") {
    console.warn(`[GeoMap] ${label} tipo inesperado:`, typeof input);
    return null;
  }

  // 1) Intento directo
  try {
    return JSON.parse(input);
  } catch (e) {
    // 2) Intento: objeto con "type" (Feature / Geometry) incrustado
    const featureIdx = input.indexOf('{"type"');
    if (featureIdx >= 0) {
      const candidate = input.slice(featureIdx);
      try {
        return JSON.parse(candidate);
      } catch (_) {
        // seguimos
      }
    }

    // 3) Intento: primer array JSON [ ... ] (para polygon con basura alrededor)
    const firstBracket = input.indexOf("[");
    const lastBracket = input.lastIndexOf("]");
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      const arrCandidate = input.slice(firstBracket, lastBracket + 1);
      try {
        return JSON.parse(arrCandidate);
      } catch (_) {
        // seguimos
      }
    }

    console.warn(
      `[GeoMap] ${label} inválido (no se pudo parsear de ninguna forma):`,
      input
    );
    return null;
  }
}

/**
 * Extrae un anillo principal [[lat,lng], ...] desde un GeoJSON (Feature / Geometry / FeatureCollection).
 * PRIORIDAD: Polygon o MultiPolygon.
 */
function latLngsFromGeomField(geomInput) {
  const geom = safeParseJSON(geomInput, "geom/geojson");
  if (!geom) return null;

  // FeatureCollection -> primer feature
  if (geom.type === "FeatureCollection" && Array.isArray(geom.features)) {
    if (!geom.features.length) return null;
    return latLngsFromGeomField(geom.features[0]);
  }

  // Feature -> geometry interna
  if (geom.type === "Feature" && geom.geometry) {
    return latLngsFromGeomField(geom.geometry);
  }

  // Geometry pura
  const g = geom;
  if (!g || !g.type || !g.coordinates) return null;

  let ring = null;

  if (g.type === "Polygon" && Array.isArray(g.coordinates[0])) {
    ring = g.coordinates[0]; // [[lng,lat], ...]
  } else if (g.type === "MultiPolygon" && Array.isArray(g.coordinates[0])) {
    ring = g.coordinates[0][0]; // primer polígono, primer anillo
  } else {
    console.warn("[GeoMap] geom no es Polygon/MultiPolygon:", g.type);
    return null;
  }

  const out = ring
    .filter(
      (pt) =>
        Array.isArray(pt) &&
        typeof pt[0] === "number" &&
        typeof pt[1] === "number"
    )
    .map(([lng, lat]) => [lat, lng]);

  return out.length >= 3 ? out : null;
}

/**
 * Extrae [[lat,lng], ...] desde el campo polygon (legacy).
 * Soporta:
 *  - string JSON de [{lat,lng}, ...] o [[lat,lng], ...] con o sin basura alrededor
 *  - array ya parseado [{lat,lng}, ...] o [[lat,lng], ...]
 */
function latLngsFromPolygonField(rawPolygon) {
  if (!rawPolygon) return null;

  const poly = safeParseJSON(rawPolygon, "polygon");
  if (!poly || !Array.isArray(poly) || poly.length < 3) return null;

  // [{lat,lng}, ...]
  if (poly[0] && poly[0].lat != null && poly[0].lng != null) {
    const arr = poly
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => [p.lat, p.lng]);
    return arr.length >= 3 ? arr : null;
  }

  // [[lat,lng], ...]
  if (
    Array.isArray(poly[0]) &&
    typeof poly[0][0] === "number" &&
    typeof poly[0][1] === "number"
  ) {
    return poly.length >= 3 ? poly : null;
  }

  console.warn("[GeoMap] formato polygon no soportado:", poly);
  return null;
}

/**
 * Estrategia B: geojson/geom primero → si no sirve, polygon → si tampoco, círculo.
 */
function getLatLngsFromRow(row) {
  // 1) Intentar geojson (moderno) y si no existe, geom (legacy)
  const geomField = row.geojson ?? row.geom;
  const fromGeom = latLngsFromGeomField(geomField);
  if (fromGeom && fromGeom.length >= 3) {
    return { type: "polygon", latlngs: fromGeom, source: "geojson/geom" };
  }

  // 2) Intentar polygon legacy
  const fromPolygon = latLngsFromPolygonField(row.polygon);
  if (fromPolygon && fromPolygon.length >= 3) {
    return { type: "polygon", latlngs: fromPolygon, source: "polygon" };
  }

  // 3) Fallback: círculo simple
  if (row.lat != null && row.lng != null) {
    const radius = row.radius_m || 50;
    return {
      type: "circle",
      center: [row.lat, row.lng],
      radius,
      source: "circle",
    };
  }

  return null;
}

/**
 * Dibuja una geocerca en el featureGroup.
 */
function drawGeocercaOnGroup(fg, row, canEdit) {
  const id = row.id;
  const nombre = row.nombre || row.name || "Geocerca";
  const color = row.color || "#2563eb";

  const shape = getLatLngsFromRow(row);
  if (!shape) {
    console.warn("[GeoMap] geocerca sin geometría usable, id:", id, row);
    return false;
  }

  let layer = null;

  if (shape.type === "polygon") {
    const latlngs = shape.latlngs;
    layer = L.polygon(latlngs, { color });
    console.log(
      `[GeoMap] dibujado polígono id=${id}, vértices=${latlngs.length}, source=${shape.source}`
    );
  } else if (shape.type === "circle") {
    layer = L.circle(shape.center, { radius: shape.radius, color });
    console.log(
      `[GeoMap] dibujado círculo id=${id} en lat=${shape.center[0]}, lng=${shape.center[1]} (source=${shape.source})`
    );
  }

  if (!layer) return false;

  layer._dbId = id;
  layer.bindTooltip(nombre, { sticky: true });
  if (!canEdit && layer.pm) layer.pm.disable();
  layer.addTo(fg);

  return true;
}

export default function GeoMap({
  canEdit,
  orgId: orgIdProp,
  geocercas = [],
  getNewFeatureMeta,
}) {
  const { currentOrg } = useAuth() || {};

  // prioridad: prop > contexto > null
  const orgId = orgIdProp ?? currentOrg?.id ?? null;

  const mapRef = useRef(null);
  const groupRef = useRef(null);
  const controlsAddedRef = useRef(false);

  const center = useMemo(() => [-1.8312, -78.1834], []); // Ecuador
  const zoom = 6;

  // Exponer debug en window para que puedas ver el estado real
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__debug_currentOrg = currentOrg || null;
      window.__debug_orgId = orgId || null;
      // eslint-disable-next-line no-console
      console.log("[GeoMap] debug currentOrg/orgId:", currentOrg, orgId);
    }
  }, [currentOrg, orgId]);

  // Redibujar cada vez que cambian las geocercas
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let fg = groupRef.current;
    if (!fg) {
      fg = L.featureGroup().addTo(map);
      groupRef.current = fg;
    }

    // Controles Geoman una sola vez
    if (!controlsAddedRef.current) {
      map.pm.addControls({
        position: "topleft",
        drawMarker: false,
        drawCircleMarker: false,
        drawCircle: false,
        drawPolyline: false,
        drawRectangle: true,
        drawPolygon: true,
        cutPolygon: false,
        editMode: canEdit,
        dragMode: canEdit,
        removalMode: canEdit,
      });
      controlsAddedRef.current = true;
    }

    // Habilitar / deshabilitar creación según canEdit + orgId
    if (!canEdit || !orgId) {
      map.pm.disableDraw("Polygon");
      map.pm.disableDraw("Rectangle");
    } else {
      map.pm.enableDraw("Polygon");
      map.pm.enableDraw("Rectangle");
    }

    fg.clearLayers();

    let anyLayer = false;
    geocercas.forEach((row) => {
      const ok = drawGeocercaOnGroup(fg, row, canEdit);
      if (ok) anyLayer = true;
    });

    if (anyLayer) {
      try {
        const bounds = fg.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.15));
        }
      } catch (e) {
        console.warn("[GeoMap] error en fitBounds:", e);
      }
    } else {
      console.warn("[GeoMap] ninguna geocerca dibujada");
    }
  }, [geocercas, canEdit, orgId]);

  // Eventos de creación / edición / borrado
  useEffect(() => {
    const map = mapRef.current;
    const fg = groupRef.current;
    if (!map || !fg) return;

    const onCreate = async (e) => {
      if (!canEdit || !orgId) {
        alert("No puedes crear geocercas sin una organización seleccionada.");
        e.layer.remove();
        return;
      }

      try {
        const layer = e.layer;
        const gj = layer.toGeoJSON(); // Feature completo

        // Derivar polygon legacy como [{lat,lng}, ...] para compatibilidad
        let polygon = null;
        if (
          gj.geometry &&
          gj.geometry.type === "Polygon" &&
          Array.isArray(gj.geometry.coordinates[0])
        ) {
          polygon = gj.geometry.coordinates[0]
            .filter(
              (pt) =>
                Array.isArray(pt) &&
                typeof pt[0] === "number" &&
                typeof pt[1] === "number"
            )
            .map(([lng, lat]) => ({ lat, lng }));
        }

        const meta = getNewFeatureMeta?.() || {};
        const nombreMeta = meta.nombre?.trim();
        const color = meta.color || "#2563eb";

        const nombre =
          nombreMeta || window.prompt("Nombre de la geocerca:") || "Geocerca";

        const saved = await createGeocerca({
          org_id: orgId,
          nombre,
          color,
          geojson: gj, // ✅ guardar en geojson
          polygon, // compatibilidad legacy
        });

        layer._dbId = saved.id;
        if (layer.setStyle) layer.setStyle({ color });
        layer.bindTooltip(`${nombre}`, { sticky: true });
        fg.addLayer(layer);
      } catch (err) {
        console.error("[GeoMap] error en onCreate:", err);
        alert("No se pudo guardar la geocerca.");
        e.layer.remove();
      }
    };

    const onEdit = async (e) => {
      if (!canEdit) return;

      const layers = e.layers || new L.LayerGroup([e.layer]);
      layers.eachLayer(async (layer) => {
        try {
          const id = layer._dbId;
          if (!id) return;

          const gj = layer.toGeoJSON(); // Feature

          let polygon = null;
          if (
            gj.geometry &&
            gj.geometry.type === "Polygon" &&
            Array.isArray(gj.geometry.coordinates[0])
          ) {
            polygon = gj.geometry.coordinates[0]
              .filter(
                (pt) =>
                  Array.isArray(pt) &&
                  typeof pt[0] === "number" &&
                  typeof pt[1] === "number"
              )
              .map(([lng, lat]) => ({ lat, lng }));
          }

          const tooltip = layer.getTooltip?.();
          const nombre = tooltip?.getContent?.() || undefined;
          const stroke = layer.options?.color || undefined;

          await updateGeocerca(id, {
            geojson: gj, // ✅ actualizar geojson
            nombre,
            color: stroke,
            polygon,
          });
        } catch (err) {
          console.error("[GeoMap] error en onEdit:", err);
          alert("No se pudo actualizar la geocerca.");
        }
      });
    };

    const onRemove = async (e) => {
      if (!canEdit) return;

      const layers = e.layers || new L.LayerGroup([e.layer]);
      layers.eachLayer(async (layer) => {
        try {
          const id = layer._dbId;
          if (!id) return;
          await deleteGeocerca(id);
        } catch (err) {
          console.error("[GeoMap] error en onRemove:", err);
          alert("No se pudo eliminar la geocerca.");
        }
      });
    };

    map.on("pm:create", onCreate);
    map.on("pm:edit", onEdit);
    map.on("pm:remove", onRemove);

    return () => {
      map.off("pm:create", onCreate);
      map.off("pm:edit", onEdit);
      map.off("pm:remove", onRemove);
    };
  }, [canEdit, orgId, getNewFeatureMeta]);

  return (
    <div className="space-y-1">
      <div className="text-xs text-slate-500">
        <span className="font-semibold">[GeoMap] Geocercas recibidas:</span>{" "}
        {geocercas.length}{" "}
        <span className="ml-2">
          (orgId: <span className="font-mono">{orgId || "null"}</span>)
        </span>
      </div>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{
          width: "100%",
          height: "600px",
          borderRadius: "1rem",
          border: "1px solid #e5e7eb",
        }}
        whenCreated={(map) => {
          mapRef.current = map;
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </MapContainer>
    </div>
  );
}
