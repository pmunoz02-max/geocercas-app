// src/pages/MapaTracking.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { supabase } from "../lib/supabaseClient";

// Icono de marcador (CDN para evitar assets locales)
const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function FitToData({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (!positions || positions.length === 0) return;
    const bounds = new L.LatLngBounds(positions.map(p => [p.lat, p.lng]));
    if (positions.length === 1) {
      map.setView([positions[0].lat, positions[0].lng], 15, { animate: true });
    } else {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [positions, map]);
  return null;
}

// Color “pseudo-aleatorio” por usuario
function colorForUser(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 80% 45%)`;
}

export default function MapaTracking() {
  const [latest, setLatest] = useState([]);     // [{user_id, lat, lng, accuracy, ts}]
  const [tracks, setTracks] = useState({});     // { user_id: [{lat,lng,ts}, ...] }
  const [windowMin, setWindowMin] = useState(30);
  const chanRef = useRef(null);
  const [loading, setLoading] = useState(true);

  // Carga posiciones actuales (tracker_latest)
  async function loadLatest() {
    const { data, error } = await supabase
      .from("tracker_latest")
      .select("user_id, org_id, lat, lng, accuracy, ts")
      .order("user_id", { ascending: true });
    if (!error && data) setLatest(data);
  }

  // Carga rastro (últimos N minutos) desde tracker_logs
  async function loadTracks(minutes) {
    const { data, error } = await supabase
      .from("tracker_logs")
      .select("user_id, lat, lng, ts")
      .gte("ts", new Date(Date.now() - minutes * 60_000).toISOString())
      .order("ts", { ascending: true });

    if (error) {
      console.error("[loadTracks]", error);
      return;
    }

    // Agrupar por usuario
    const grouped = {};
    for (const r of data || []) {
      if (!grouped[r.user_id]) grouped[r.user_id] = [];
      grouped[r.user_id].push({ lat: r.lat, lng: r.lng, ts: r.ts });
    }
    setTracks(grouped);
  }

  // Carga inicial + realtime
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await loadLatest();
      await loadTracks(windowMin);
      if (alive) setLoading(false);
    })();

    chanRef.current = supabase
      .channel("realtime-tracker-logs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tracker_logs" },
        async () => {
          // Refrescar ambos (simple y robusto)
          await loadLatest();
          await loadTracks(windowMin);
        }
      )
      .subscribe();

    return () => {
      alive = false;
      if (chanRef.current) supabase.removeChannel(chanRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si cambia la ventana, recarga tracks
  useEffect(() => {
    loadTracks(windowMin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowMin]);

  const defaultCenter = useMemo(() => [-0.1807, -78.4678], []);
  const positions = latest.map(p => ({ lat: p.lat, lng: p.lng }));

  return (
    <div style={{ height: "calc(100vh - 64px)" }}>
      {/* Controles */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 8px 0 8px" }}>
        <label>Rastro: </label>
        <select value={windowMin} onChange={(e) => setWindowMin(parseInt(e.target.value, 10))}>
          <option value={15}>15 min</option>
          <option value={30}>30 min</option>
          <option value={60}>60 min</option>
        </select>
        <button onClick={() => { loadLatest(); loadTracks(windowMin); }}>Refrescar</button>
        {loading && <span style={{ fontSize: 12, opacity: 0.7 }}>Cargando…</span>}
      </div>

      <MapContainer
        center={positions.length ? positions[0] : defaultCenter}
        zoom={13}
        style={{ height: "calc(100% - 36px)", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitToData positions={positions} />

        {/* Rastro por usuario */}
        {Object.entries(tracks).map(([user_id, pts]) => (
          pts.length > 1 && (
            <Polyline
              key={`pl-${user_id}`}
              positions={pts.map(p => [p.lat, p.lng])}
              pathOptions={{ color: colorForUser(user_id), weight: 4, opacity: 0.8 }}
            />
          )
        ))}

        {/* Últimas posiciones (marcadores) */}
        {latest.map((p) => (
          <Marker key={p.user_id} position={[p.lat, p.lng]} icon={markerIcon}>
            <Popup>
              <div style={{ lineHeight: 1.35 }}>
                <b>{p.user_id}</b><br />
                {new Date(p.ts).toLocaleString()}<br />
                acc: {p.accuracy ?? "–"} m
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
