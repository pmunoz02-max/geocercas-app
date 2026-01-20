// src/components/GeoMap.jsx
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import { useAuth } from "../context/AuthContext.jsx";

/**
 * GeoMap (API-first friendly):
 * - NO guarda / NO edita / NO elimina en DB.
 * - Solo dibuja (según `geocercas`) y emite eventos:
 *    - onCreateFeature({ orgId, nombre, color, geojson, polygon, layer })
 *    - onEditFeature({ orgId, id, geojson, polygon, nombre, color, layer })
 *    - onDeleteFeature({ orgId, id, layer })
 *
 * NUEVO:
 *  - onNotify({ type: "info"|"ok"|"error", text, error? })
 *    (opcional, para mostrar banners/toasts en el orquestador)
 *
 * Importante:
 *  - NO usa alert().
 *  - NO toca Supabase.
 */

// --- safeParseJSON "blindado" (se conserva) ---
function safeParseJSON(input, label = "JSON") {
  if (!input) return null;

  if (typeof input === "object") return input;

  if (typeof input !== "string") {
    console.warn(`[GeoMap] ${label} tipo inesperado:`, typeof input);
    return null;
  }

  try {
    return JSON.parse(input);
  } catch (e) {
    const featureIdx = input.indexOf('{"type"');
    if (featureIdx >= 0) {
      const candidate = input.slice(featureIdx);
      try {
        return JSON.parse(candidate);
      } catch (_) {}
    }

    const firstBracket = input.indexOf("[");
    const lastBracket = input.lastIndexOf("]");
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      const arrCandidate = input.slice(firstBracket, lastBracket + 1);
      try {
        return JSON.parse(arrCandidate);
      } catch (_) {}
    }

    console.warn(`[GeoMap] ${label} inválido (no se pudo parsear):`, input);
    return null;
  }
}

function latLngsFromGeomField(geomInput) {
  const geom = safeParseJSON(geomInput, "geom/geojson");
  if (!geom) return null;

  if (geom.type === "FeatureCollection" && Array.isArray(geom.features)) {
    if (!geom.features.length) return null;
    return latLngsFromGeomField(geom.features[0]);
  }

  if (geom.type === "Feature" && geom.geometry) {
    return latLngsFromGeomField(geom.geometry);
  }

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

function latLngsFromPolygonField(rawPolygon) {
  if (!rawPolygon) return null;

  const poly = safeParseJSON(rawPolygon, "polygon");
  if (!poly || !Array.isArray(poly) || poly.length < 3) return null;

  if (poly[0] && poly[0].lat != null && poly[0].lng != null) {
    const arr = poly
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => [p.lat, p.lng]);
    return arr.length >= 3 ? arr : null;
  }

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

function getLatLngsFromRow(row) {
  const geomField = row.geojson ?? row.geom;
  const fromGeom = latLngsFromGeomField(geomField);
  if (fromGeom && fromGeom.length >= 3) {
    return { type: "polygon", latlngs: fromGeom, source: "geojson/geom" };
  }

  const fromPolygon = latLngsFromPolygonField(row.polygon);
  if (fromPolygon && fromPolygon.length >= 3) {
    return { type: "polygon", latlngs: fromPolygon, source: "polygon" };
  }

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
    layer = L.polygon(shape.latlngs, { color });
  } else if (shape.type === "circle") {
    layer = L.circle(shape.center, { radius: shape.radius, color });
  }

  if (!layer) return false;

  layer._dbId = id;
  layer.bindTooltip(nombre, { sticky: true });

  if (!canEdit && layer.pm) layer.pm.disable();
  layer.addTo(fg);

  return true;
}

// Convierte Feature Polygon a polygon legacy [{lat,lng}, ...] (compat)
function polygonLegacyFromFeature(gj) {
  try {
    if (
      gj?.geometry?.type === "Polygon" &&
      Array.isArray(gj.geometry.coordinates?.[0])
    ) {
      return gj.geometry.coordinates[0]
        .filter(
          (pt) =>
            Array.isArray(pt) &&
            typeof pt[0] === "number" &&
            typeof pt[1] === "number"
        )
        .map(([lng, lat]) => ({ lat, lng }));
    }
  } catch {}
  return null;
}

export default function GeoMap({
  canEdit = false,
  orgId: orgIdProp,
  geocercas = [],
  getNewFeatureMeta,
  onCreateFeature,
  onEditFeature,
  onDeleteFeature,
  onNotify, // ✅ NUEVO opcional
}) {
  const { currentOrg } = useAuth() || {};
  const orgId = orgIdProp ?? currentOrg?.id ?? null;

  const mapRef = useRef(null);
  const groupRef = useRef(null);
  const controlsAddedRef = useRef(false);

  const center = useMemo(() => [-1.8312, -78.1834], []); // Ecuador
  const zoom = 6;

  const notify = (payload) => {
    try {
      if (typeof onNotify === "function") onNotify(payload);
      else {
        // fallback no intrusivo
        if (payload?.type === "error") console.error("[GeoMap notify]", payload);
        else console.log("[GeoMap notify]", payload);
      }
    } catch (e) {
      console.error("[GeoMap notify] error", e);
    }
  };

  // Debug útil
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__debug_orgId = orgId || null;
      window.__debug_canEdit = !!canEdit;
      console.log("[GeoMap] orgId/canEdit:", orgId, canEdit);
    }
  }, [orgId, canEdit]);

  // Redibujar cuando cambian las geocercas
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
        editMode: false,
        dragMode: false,
        removalMode: false,
      });
      controlsAddedRef.current = true;
    }

    // Habilitar / deshabilitar modos globales según permisos
    try {
      map.pm.disableGlobalEditMode?.();
      map.pm.disableGlobalDragMode?.();
      map.pm.disableGlobalRemovalMode?.();
      map.pm.disableDraw?.();
      if (canEdit && orgId) {
        // no-op: dejamos solo botones habilitados
      }
    } catch {}

    fg.clearLayers();

    let anyLayer = false;
    geocercas.forEach((row) => {
      const ok = drawGeocercaOnGroup(fg, row, canEdit);
      if (ok) anyLayer = true;
    });

    if (anyLayer) {
      try {
        const bounds = fg.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.15));
      } catch (e) {
        console.warn("[GeoMap] error en fitBounds:", e);
      }
    }
  }, [geocercas, canEdit, orgId]);

  // Eventos Geoman: SOLO emiten callbacks
  useEffect(() => {
    const map = mapRef.current;
    const fg = groupRef.current;
    if (!map || !fg) return;

    const requireWritableContext = () => {
      if (!canEdit) return { ok: false, msg: "No tienes permisos para editar." };
      if (!orgId) return { ok: false, msg: "Selecciona una organización primero." };
      return { ok: true };
    };

    const onCreate = async (e) => {
      const gate = requireWritableContext();
      if (!gate.ok) {
        notify({ type: "info", text: gate.msg });
        try { e.layer?.remove?.(); } catch {}
        return;
      }

      const layer = e.layer;
      const gj = layer.toGeoJSON(); // Feature completo
      const polygon = polygonLegacyFromFeature(gj);

      const meta = (getNewFeatureMeta?.() || {});
      const color = meta.color || "#2563eb";
      const nombreMeta = meta.nombre?.trim();

      const nombre =
        nombreMeta || window.prompt("Nombre de la geocerca:") || "Geocerca";

      // Estilo/tooltip local inmediato (visual)
      if (layer.setStyle) layer.setStyle({ color });
      layer.bindTooltip(`${nombre}`, { sticky: true });

      try {
        // ✅ NO DB aquí. Emitimos evento.
        if (typeof onCreateFeature === "function") {
          const result = await onCreateFeature({
            orgId,
            nombre,
            color,
            geojson: gj,
            polygon,
            layer,
          });

          // Si el orquestador devuelve id, lo guardamos en el layer para ediciones/borrado.
          if (result?.id) layer._dbId = result.id;
        } else {
          // Sin handler: dejamos la capa como "draft" visual.
          layer._draft = true;
        }

        fg.addLayer(layer);
      } catch (err) {
        console.error("[GeoMap] onCreateFeature error:", err);
        notify({ type: "error", text: "No se pudo guardar la geocerca.", error: err });
        try { layer?.remove?.(); } catch {}
      }
    };

    const onEdit = async (e) => {
      const gate = requireWritableContext();
      if (!gate.ok) {
        notify({ type: "info", text: gate.msg });
        return;
      }

      const layers = e.layers || new L.LayerGroup([e.layer]);
      layers.eachLayer(async (layer) => {
        try {
          const id = layer._dbId;
          if (!id) return;

          const gj = layer.toGeoJSON();
          const polygon = polygonLegacyFromFeature(gj);

          const tooltip = layer.getTooltip?.();
          const nombre = tooltip?.getContent?.() || undefined;
          const stroke = layer.options?.color || undefined;

          if (typeof onEditFeature === "function") {
            await onEditFeature({
              orgId,
              id,
              geojson: gj,
              polygon,
              nombre,
              color: stroke,
              layer,
            });
          }
        } catch (err) {
          console.error("[GeoMap] onEditFeature error:", err);
          notify({ type: "error", text: "No se pudo actualizar la geocerca.", error: err });
        }
      });
    };

    const onRemove = async (e) => {
      const gate = requireWritableContext();
      if (!gate.ok) {
        notify({ type: "info", text: gate.msg });
        return;
      }

      const layers = e.layers || new L.LayerGroup([e.layer]);
      layers.eachLayer(async (layer) => {
        try {
          const id = layer._dbId;
          if (!id) return;

          if (typeof onDeleteFeature === "function") {
            await onDeleteFeature({ orgId, id, layer });
          }
        } catch (err) {
          console.error("[GeoMap] onDeleteFeature error:", err);
          notify({ type: "error", text: "No se pudo eliminar la geocerca.", error: err });
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
  }, [canEdit, orgId, getNewFeatureMeta, onCreateFeature, onEditFeature, onDeleteFeature]);

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
