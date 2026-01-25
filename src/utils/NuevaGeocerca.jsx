// src/utils/NuevaGeocerca.jsx
import { useRef, useState } from "react";
import { MapContainer, TileLayer, FeatureGroup } from "react-leaflet";
import { GeomanControls } from "react-leaflet-geoman-v2";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import supabase from "../lib/supabaseClient";
import { crearGeocerca } from "../services/geocercas";

// Helpers Geoman: limpiar capas dibujadas
function getGeomanLayers(map) {
  try {
    if (!map?.pm?.getGeomanLayers) return [];
    return map.pm.getGeomanLayers() || [];
  } catch {
    return [];
  }
}

function removeAllGeomanLayers(map) {
  const layers = getGeomanLayers(map);
  for (const lyr of layers) {
    try {
      map.removeLayer(lyr);
    } catch {}
  }
}

// Convierte texto "lat,lng" por línea a un string normalizado (lo procesa el servicio)
function normalizeCoordText(texto) {
  return String(texto || "").trim();
}

export default function NuevaGeocerca() {
  const [nombre, setNombre] = useState("Casa");
  const [textoCoords, setTextoCoords] = useState(""); // líneas "lat, lng"
  const [guardando, setGuardando] = useState(false);

  const mapRef = useRef(null);

  // guardamos el último polígono dibujado como array [{lat,lng}, ...]
  const drawnLatLngsRef = useRef(null);

  const onCreated = (e) => {
    try {
      // Geoman entrega e.layer
      const layer = e?.layer;
      if (!layer) return;

      // Guardamos latlngs si es polygon/rectangle
      if (typeof layer.getLatLngs === "function") {
        const arr = layer.getLatLngs(); // típicamente [[{lat,lng}...]]
        const ring = Array.isArray(arr) ? arr[0] : [];
        const latlngs =
          Array.isArray(ring) && Array.isArray(ring[0]) ? ring[0] : ring;

        if (Array.isArray(latlngs) && latlngs.length) {
          drawnLatLngsRef.current =
            latlngs.map((p) => ({ lat: p.lat, lng: p.lng })) || null;
        }
      }

      // deja solo una figura
      if (mapRef.current) {
        const map = mapRef.current;
        const layers = getGeomanLayers(map);
        for (const lyr of layers) {
          if (lyr !== layer) {
            try {
              map.removeLayer(lyr);
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error("[utils/NuevaGeocerca] onCreated error:", err);
    }
  };

  const onRemoved = () => {
    drawnLatLngsRef.current = null;
  };

  async function onGuardar() {
    try {
      setGuardando(true);

      // 1) Fuente de geometría: texto > mapa
      const txt = normalizeCoordText(textoCoords);
      const geometriaInput = txt.length > 0 ? txt : drawnLatLngsRef.current;

      // ✅ Validación real (esto sí debe avisar)
      if (
        !geometriaInput ||
        (Array.isArray(geometriaInput) && geometriaInput.length < 3)
      ) {
        alert(
          'Agrega coordenadas (texto "lat, lng" por línea) o dibuja un polígono en el mapa.'
        );
        return;
      }

      // 2) owner_id
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const ownerId = user?.id;

      // 3) Guardar
      await crearGeocerca(
        { nombre: (nombre || "").trim(), geometria: geometriaInput },
        ownerId
      );

      // ✅ Guardado → SILENCIO (sin alert)
      setTextoCoords("");
      drawnLatLngsRef.current = null;

      // limpia visualmente el mapa
      if (mapRef.current) removeAllGeomanLayers(mapRef.current);
    } catch (e) {
      // ❗ Regla: no mostrar error "no se pudo guardar" porque puede ser falso
      console.error("[utils/NuevaGeocerca] Error durante guardar (silencioso):", e);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      <div>
        <h2 className="font-bold text-xl mb-3">Nueva Geocerca</h2>

        <label className="block text-sm font-medium mb-1">Nombre</label>
        <input
          className="w-full border rounded px-3 py-2 mb-3"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de la geocerca"
        />

        <label className="block text-sm font-medium mb-1">
          Coordenadas <span className="font-normal">(lat, lng) por línea</span>
        </label>
        <textarea
          className="w-full border rounded px-3 py-2 h-48 font-mono text-sm"
          value={textoCoords}
          onChange={(e) => setTextoCoords(e.target.value)}
          placeholder={`-0.064778, -78.479860
-0.084176, -78.479345
-0.081773, -78.442266
-0.060658, -78.446043`}
        />

        <button
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
          onClick={onGuardar}
          disabled={guardando}
          type="button"
        >
          {guardando ? "Guardando…" : "Guardar Geocerca"}
        </button>

        <p className="text-xs text-gray-500 mt-2">
          Si el cuadro queda vacío, <b>se usará el polígono dibujado</b> en el mapa.
        </p>
      </div>

      <div>
        <MapContainer
          center={[-0.07, -78.47]}
          zoom={13}
          style={{ height: 480, width: "100%", borderRadius: 12 }}
          whenCreated={(map) => (mapRef.current = map)}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FeatureGroup>
            <GeomanControls
              options={{
                position: "topright",
                drawMarker: false,
                drawCircleMarker: false,
                drawPolyline: false,
                drawText: false,
                drawCircle: false,
                drawRectangle: true,
                drawPolygon: true,
                editMode: true,
                dragMode: true,
                removalMode: true,
              }}
              globalOptions={{ continueDrawing: false, editable: true }}
              onCreate={onCreated}
              onRemove={onRemoved}
            />
          </FeatureGroup>
        </MapContainer>
      </div>
    </div>
  );
}
