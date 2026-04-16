import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { supabase } from "../supabaseClient";
import Button from "./ui/Button";

/* ====================== UTILIDADES ====================== */
const fmt = (latlngs) => latlngs.map((p) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`).join("\n");

const parseTextarea = (raw) => {
  const lines = raw.split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return [];

  return lines.map((line, i) => {
    const [lat, lng] = line.split(",").map((v) => parseFloat(v.trim()));
    if (isNaN(lat) || isNaN(lng)) {
      throw new Error(`Line ${i + 1} is invalid: \"${line}\"`);
    }
    return { lat, lng };
  });
};

const ensureClosedRing = (latlngs) => {
  const ring = latlngs.map(({ lat, lng }) => [lng, lat]);
  if (ring.length < 3) throw new Error("At least 3 vertices are required.");

  const [fLng, fLat] = ring[0];
  const [lLng, lLat] = ring[ring.length - 1];
  if (fLng !== lLng || fLat !== lLat) ring.push([fLng, fLat]);
  if (ring.length < 4) throw new Error("3 distinct vertices are required.");
  return ring;
};

const toEWKT = (ring) =>
  `SRID=4326;POLYGON((${ring.map(([lng, lat]) => `${lng} ${lat}`).join(", ")}))`;

/* ====================== PÁGINA ====================== */
export default function GeofenceForm() {
  const { t } = useTranslation();
  const tt = useCallback((key, fallback, options = {}) => t(key, { defaultValue: fallback, ...options }), [t]);

  const [nombre, setNombre] = useState("");
  const [textoCoords, setTextoCoords] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [hover, setHover] = useState({ lat: null, lng: null });
  const [selectedVertices, setSelectedVertices] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  const handleGuardar = async () => {
    try {
      setGuardando(true);
      setFeedback({ type: "", message: "" });

      const pts = textoCoords.trim()
        ? parseTextarea(textoCoords)
        : selectedVertices.length
          ? selectedVertices
          : [];

      if (pts.length < 3) {
        throw new Error(tt("geofenceForm.errors.minPoints", "At least 3 points are required."));
      }

      const ewkt = toEWKT(ensureClosedRing(pts));
      const { error } = await supabase
        .from("geocercas")
        .insert([{ nombre: nombre || tt("geofenceForm.fallbacks.unnamed", "Unnamed"), geom: ewkt }]);

      if (error) throw error;

      setFeedback({
        type: "success",
        message: tt("geofenceForm.messages.saved", "Geofence saved successfully."),
      });
      setNombre("");
      setTextoCoords("");
      setSelectedVertices([]);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setFeedback({
        type: "error",
        message: tt("geofenceForm.messages.errorPrefix", "Could not save geofence. Please try again."),
      });
      console.error(err);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
      <div className="app-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          <h2 className="font-bold !text-base sm:!text-lg">
            {tt("geofenceForm.title", "New geofence")}
          </h2>

          <label className="text-sm font-medium">{tt("geofenceForm.fields.name", "Name")}</label>
          <input
            className="w-full rounded-md px-3 py-2"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={tt("geofenceForm.fields.namePlaceholder", "E.g. Field 1")}
          />

          <label className="text-sm font-medium">
            {tt("geofenceForm.fields.coordinates", "Coordinates")} (<code>lat,lng</code> {tt("geofenceForm.fields.onePerLine", "per line")})
          </label>
          <textarea
            className="w-full border rounded !px-3 !py-2 !text-xs sm:!px-2 sm:!py-1 sm:!text-sm h-32 sm:h-40"
            value={textoCoords}
            onChange={(e) => setTextoCoords(e.target.value)}
            placeholder="-0.1807, -78.4678"
          />

          <Button
            variant="primary"
            onClick={handleGuardar}
            disabled={guardando}
          >
            {guardando
              ? tt("geofenceForm.actions.saving", "Saving...")
              : tt("geofenceForm.actions.save", "Save geofence")}
          </Button>

          {feedback.type === "error" && (
            <div className="banner banner-error">{feedback.message}</div>
          )}

          {feedback.type === "success" && (
            <div className="banner banner-success">{feedback.message}</div>
          )}

          <p className="!text-[11px] sm:!text-xs text-gray-500">
            {tt(
              "geofenceForm.hints.mapSelection",
              "Draw or select on the map; if the box is empty, that polygon will be used."
            )}
          </p>
        </div>
      </div>

      <div className="md:col-span-2 border rounded-md overflow-hidden relative h-[58svh] md:h-[520px]">
        <div className="absolute z-[1000] right-2 bottom-2 bg-white/90 border rounded px-2 py-1 !text-[11px] sm:!text-xs font-mono shadow">
          {hover.lat != null ? (
            <>
              {tt("geofenceForm.map.lat", "Lat")}: {hover.lat.toFixed(6)} · {tt("geofenceForm.map.lng", "Lng")}: {hover.lng.toFixed(6)}
            </>
          ) : (
            <>{tt("geofenceForm.map.movePointer", "Move the pointer over the map…")}</>
          )}
        </div>

        <MapContainer
          center={[-0.1807, -78.4678]}
          zoom={13}
          doubleClickZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <GeofenceController
            setHover={setHover}
            onVerticesChange={(latlngs) => {
              setSelectedVertices(latlngs);
              setTextoCoords(fmt(latlngs));
            }}
            onFeedback={setFeedback}
            refreshKey={refreshKey}
            tt={tt}
          />
        </MapContainer>
      </div>
    </div>
  );
}

/* ====================== CONTROLADOR DEL MAPA ====================== */
function GeofenceController({ setHover, onVerticesChange, onFeedback, refreshKey, tt }) {
  const map = useMap();
  const groupRef = useRef(null);

  const polyStyle = useMemo(() => ({ color: "#1e40af", weight: 2, fillOpacity: 0.2 }), []);

  const upsertLayerEvents = (layer) => {
    layer.pm?.enable({ allowSelfIntersection: false });

    layer.on("click", () => {
      const latlngs = layer.getLatLngs()[0].map((p) => ({ lat: p.lat, lng: p.lng }));
      onVerticesChange?.(latlngs);
    });
  };

  const loadGeofences = useCallback(async () => {
    if (!groupRef.current) groupRef.current = L.featureGroup().addTo(map);
    groupRef.current.clearLayers();

    const { data, error } = await supabase.from("geocercas_geojson").select("*");
    if (error) {
      console.error("loadGeofences:", error);
      return;
    }

    (data || []).forEach((row) => {
      const gj = JSON.parse(row.geojson);
      const coords = gj.coordinates[0].map(([lng, lat]) => [lat, lng]);
      const layer = L.polygon(coords, polyStyle);
      layer.options._geocercaId = row.id;
      layer.addTo(groupRef.current);
      layer.bindTooltip(row.nombre || tt("geofenceForm.fallbacks.unnamed", "Unnamed"));
      upsertLayerEvents(layer);
    });
  }, [map, onVerticesChange, polyStyle, tt]);

  useEffect(() => {
    map.pm.addControls({
      position: "topleft",
      drawMarker: false,
      drawCircle: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawText: false,
      drawPolygon: true,
      editMode: true,
      removalMode: true,
      dragMode: false,
      cutPolygon: false,
    });

    map.pm.setGlobalOptions({
      finishOnDoubleClick: false,
      snappable: true,
      snapDistance: 20,
    });

    const onMove = (e) => setHover({ lat: e.latlng.lat, lng: e.latlng.lng });
    map.on("mousemove", onMove);

    const onCreate = async (e) => {
      if (e.shape !== "Polygon") return;
      const layer = e.layer;
      const latlngs = layer.getLatLngs()[0].map((p) => ({ lat: p.lat, lng: p.lng }));

      try {
        const ewkt = toEWKT(ensureClosedRing(latlngs));
        const { data, error } = await supabase
          .from("geocercas")
          .insert([{ nombre: tt("geofenceForm.fallbacks.unnamed", "Unnamed"), geom: ewkt }])
          .select("id")
          .single();

        if (error) throw error;

        layer.options._geocercaId = data.id;
        if (!groupRef.current) groupRef.current = L.featureGroup().addTo(map);
        groupRef.current.addLayer(layer);
        upsertLayerEvents(layer);

        onVerticesChange?.(latlngs);
        onFeedback?.({
          type: "success",
          message: tt("geofenceForm.messages.created", "Geofence created successfully."),
        });
      } catch (err) {
        onFeedback?.({
          type: "error",
          message: tt("geofenceForm.messages.createError", "Could not create geofence. Please try again."),
        });
        try {
          map.removeLayer(layer);
        } catch {}
      }
    };

    const onEdit = async (e) => {
      const updates = [];
      e.layers.eachLayer((layer) => {
        const id = layer.options._geocercaId;
        if (!id) return;
        const latlngs = layer.getLatLngs()[0].map((p) => ({ lat: p.lat, lng: p.lng }));
        const ewkt = toEWKT(ensureClosedRing(latlngs));
        updates.push({ id, ewkt, latlngs });
      });

      try {
        for (const u of updates) {
          const { error } = await supabase.from("geocercas").update({ geom: u.ewkt }).eq("id", u.id);
          if (error) throw error;
          onVerticesChange?.(u.latlngs);
        }
        onFeedback?.({
          type: "success",
          message: tt("geofenceForm.messages.updated", "Geofence(s) updated successfully."),
        });
      } catch (err) {
        onFeedback?.({
          type: "error",
          message: tt("geofenceForm.messages.updateError", "Could not update geofence. Please try again."),
        });
        console.error(err);
      }
    };

    const onRemove = async (e) => {
      const ids = [];
      e.layers.eachLayer((layer) => {
        if (layer.options._geocercaId) ids.push(layer.options._geocercaId);
      });
      if (!ids.length) return;

      try {
        const { error } = await supabase.from("geocercas").delete().in("id", ids);
        if (error) throw error;
        onFeedback?.({
          type: "success",
          message: tt("geofenceForm.messages.deleted", "Geofence(s) deleted successfully."),
        });
      } catch (err) {
        onFeedback?.({
          type: "error",
          message: tt("geofenceForm.messages.deleteError", "Could not delete geofence. Please try again."),
        });
        console.error(err);
      }
    };

    map.on("pm:create", onCreate);
    map.on("pm:edit", onEdit);
    map.on("pm:remove", onRemove);

    loadGeofences();

    return () => {
      map.off("mousemove", onMove);
      map.off("pm:create", onCreate);
      map.off("pm:edit", onEdit);
      map.off("pm:remove", onRemove);
      try {
        map.pm.removeControls();
      } catch {}
    };
  }, [loadGeofences, map, onVerticesChange, setHover, tt]);

  useEffect(() => {
    loadGeofences();
  }, [loadGeofences, refreshKey]);

  return null;
}
