import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { supabase } from "../supabaseClient";

/* ====================== UTILIDADES ====================== */
const fmt = (latlngs) =>
  latlngs.map((p) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`).join("\n");

const parseTextarea = (raw) => {
  const lines = raw.split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return [];
  return lines.map((line, i) => {
    const [lat, lng] = line.split(",").map((v) => parseFloat(v.trim()));
    if (isNaN(lat) || isNaN(lng)) throw new Error(`Línea ${i + 1} inválida: "${line}"`);
    return { lat, lng };
  });
};

const ensureClosedRing = (latlngs) => {
  const ring = latlngs.map(({ lat, lng }) => [lng, lat]); // [lng,lat]
  if (ring.length < 3) throw new Error("Se requieren al menos 3 vértices.");
  const [fLng, fLat] = ring[0];
  const [lLng, lLat] = ring[ring.length - 1];
  if (fLng !== lLng || fLat !== lLat) ring.push([fLng, fLat]);
  if (ring.length < 4) throw new Error("Se requieren 3 vértices distintos.");
  return ring;
};

const toEWKT = (ring) =>
  `SRID=4326;POLYGON((${ring.map(([lng, lat]) => `${lng} ${lat}`).join(", ")}))`;

/* ====================== PÁGINA ====================== */
export default function GeofenceForm() {
  const [nombre, setNombre] = useState("");
  const [textoCoords, setTextoCoords] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [hover, setHover] = useState({ lat: null, lng: null });

  // vértices seleccionados (último polígono clicado/dibujado/editado)
  const [selectedVertices, setSelectedVertices] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleGuardar = async () => {
    try {
      setGuardando(true);

      const pts =
        textoCoords.trim()
          ? parseTextarea(textoCoords)
          : selectedVertices.length
          ? selectedVertices
          : [];

      if (pts.length < 3) throw new Error("Se requieren al menos 3 puntos.");

      const ewkt = toEWKT(ensureClosedRing(pts));
      const { error } = await supabase
        .from("geocercas")
        .insert([{ nombre: nombre || "Sin nombre", geom: ewkt }]);

      if (error) throw error;

      alert("✅ Geocerca guardada.");
      setNombre("");
      setTextoCoords("");
      setSelectedVertices([]);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      alert("Error: " + err.message);
      console.error(err);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Panel izquierdo */}
      <div className="p-4 border rounded-md">
        <h2 className="font-bold text-lg mb-2">Nueva Geocerca</h2>

        <label className="text-sm">Nombre</label>
        <input
          className="w-full border rounded px-2 py-1 mb-3"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Lote 1"
        />

        <label className="text-sm">
          Coordenadas (<code>lat,lng</code> por línea)
        </label>
        <textarea
          className="w-full h-40 border rounded px-2 py-1 mb-2"
          value={textoCoords}
          onChange={(e) => setTextoCoords(e.target.value)}
          placeholder="-0.1807, -78.4678"
        />

        <button
          onClick={handleGuardar}
          disabled={guardando}
          className="bg-blue-600 text-white px-3 py-2 rounded w-full"
        >
          {guardando ? "Guardando..." : "Guardar Geocerca"}
        </button>

        <p className="text-xs text-gray-500 mt-2">
          Dibuja/selecciona en el mapa; si el cuadro está vacío, se usará ese polígono.
        </p>
      </div>

      {/* Mapa */}
      <div className="md:col-span-2 h-[520px] border rounded-md overflow-hidden relative">
        {/* HUD Lat/Lng */}
        <div className="absolute z-[1000] right-2 bottom-2 bg-white/90 border rounded px-2 py-1 text-xs font-mono shadow">
          {hover.lat != null
            ? <>Lat: {hover.lat.toFixed(6)} · Lng: {hover.lng.toFixed(6)}</>
            : <>Mueve el puntero sobre el mapa…</>}
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
              setTextoCoords(fmt(latlngs)); // sincroniza textarea
            }}
            refreshKey={refreshKey}
          />
        </MapContainer>
      </div>
    </div>
  );
}

/* ====================== CONTROLADOR DEL MAPA ====================== */
function GeofenceController({ setHover, onVerticesChange, refreshKey }) {
  const map = useMap();
  const groupRef = useRef(null); // siempre metemos capas aquí

  const polyStyle = useMemo(
    () => ({ color: "#1e40af", weight: 2, fillOpacity: 0.2 }),
    []
  );

  const upsertLayerEvents = (layer) => {
    // Habilita edición/borrado por Geoman sobre la capa
    layer.pm?.enable({ allowSelfIntersection: false });

    // Al hacer click, mandamos vértices al panel
    layer.on("click", () => {
      const latlngs = layer.getLatLngs()[0].map((p) => ({ lat: p.lat, lng: p.lng }));
      onVerticesChange?.(latlngs);
    });
  };

  const loadGeofences = async () => {
    // crea el featureGroup si no existe
    if (!groupRef.current) groupRef.current = L.featureGroup().addTo(map);
    groupRef.current.clearLayers();

    // trae desde la vista geojson
    const { data, error } = await supabase
      .from("geocercas_geojson")
      .select("*");
    if (error) {
      console.error("loadGeofences:", error);
      return;
    }

    data.forEach((row) => {
      const gj = JSON.parse(row.geojson); // Polygon en GeoJSON
      const coords = gj.coordinates[0].map(([lng, lat]) => [lat, lng]);
      const layer = L.polygon(coords, polyStyle);
      layer.options._geocercaId = row.id;
      layer.addTo(groupRef.current);
      layer.bindTooltip(row.nombre);
      upsertLayerEvents(layer);
    });
  };

  useEffect(() => {
    // Controles Geoman
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
      removalMode: true,  // <-- botón de basura
      dragMode: false,
      cutPolygon: false,
    });

    map.pm.setGlobalOptions({
      finishOnDoubleClick: false, // no cierra con doble clic
      snappable: true,
      snapDistance: 20,
    });

    // HUD Lat/Lng
    const onMove = (e) => setHover({ lat: e.latlng.lat, lng: e.latlng.lng });
    map.on("mousemove", onMove);

    // Crear nuevo (INSERT)
    const onCreate = async (e) => {
      if (e.shape !== "Polygon") return;
      const layer = e.layer;
      const latlngs = layer.getLatLngs()[0].map((p) => ({ lat: p.lat, lng: p.lng }));

      try {
        const ewkt = toEWKT(ensureClosedRing(latlngs));
        const { data, error } = await supabase
          .from("geocercas")
          .insert([{ nombre: "Sin nombre", geom: ewkt }])
          .select("id")
          .single();
        if (error) throw error;

        layer.options._geocercaId = data.id;
        // mover la capa creada al featureGroup (para que removal/edición afecte)
        if (!groupRef.current) groupRef.current = L.featureGroup().addTo(map);
        groupRef.current.addLayer(layer);
        upsertLayerEvents(layer);

        onVerticesChange?.(latlngs);
        alert("✅ Geocerca creada.");
      } catch (err) {
        alert("Error al crear: " + err.message);
        try { map.removeLayer(layer); } catch {}
      }
    };

    // Editar existente (UPDATE)
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
          const { error } = await supabase
            .from("geocercas")
            .update({ geom: u.ewkt })
            .eq("id", u.id);
          if (error) throw error;
          onVerticesChange?.(u.latlngs);
        }
        alert("✅ Geocerca(s) actualizada(s).");
      } catch (err) {
        alert("Error al actualizar: " + err.message);
        console.error(err);
      }
    };

    // Eliminar (DELETE)
    const onRemove = async (e) => {
      const ids = [];
      e.layers.eachLayer((layer) => {
        if (layer.options._geocercaId) ids.push(layer.options._geocercaId);
      });
      if (!ids.length) return;

      try {
        const { error } = await supabase.from("geocercas").delete().in("id", ids);
        if (error) throw error;
        alert("🗑️ Geocerca(s) eliminada(s).");
      } catch (err) {
        alert("Error al borrar: " + err.message);
        console.error(err);
      }
    };

    map.on("pm:create", onCreate);
    map.on("pm:edit", onEdit);
    map.on("pm:remove", onRemove);

    // Primera carga
    loadGeofences();

    return () => {
      map.off("mousemove", onMove);
      map.off("pm:create", onCreate);
      map.off("pm:edit", onEdit);
      map.off("pm:remove", onRemove);
      try { map.pm.removeControls(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Recargar después de crear desde el panel izquierdo
  useEffect(() => {
    loadGeofences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return null;
}
