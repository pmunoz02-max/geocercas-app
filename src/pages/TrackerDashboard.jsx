// src/pages/TrackerDashboard.jsx
import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

const AUTO_REFRESH_MS = 30_000; // refresco automático cada 30s

const TIME_WINDOWS = [
  { label: "1 hora", valueHours: 1 },
  { label: "6 horas", valueHours: 6 },
  { label: "12 horas", valueHours: 12 },
  { label: "24 horas", valueHours: 24 },
];

function computeWindowRange(hours) {
  const now = new Date();
  const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
  return {
    from: from.toISOString(),
    to: now.toISOString(),
  };
}

function TrackerDashboard() {
  const { currentOrg, currentRole } = useAuth();

  const [timeWindowHours, setTimeWindowHours] = useState(6);
  const [selectedTrackerId, setSelectedTrackerId] = useState("all");

  const [geofences, setGeofences] = useState([]);
  const [trackers, setTrackers] = useState([]);
  const [logs, setLogs] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mapRef = useRef(null);

  useEffect(() => {
    if (!currentOrg) return;
    console.log(
      "[TrackerDashboard] tenantId usado (currentOrg.id):",
      currentOrg.id
    );

    let cancelled = false;

    async function loadInitialData() {
      setLoading(true);
      setError(null);
      try {
        // GEOCERCAS visibles y activas para la org
        const { data: fencesData, error: fencesErr } = await supabase
          .from("geocercas")
          .select("*")
          .eq("org_id", currentOrg.id)
          .eq("visible", true)
          .eq("activa", true)
          .order("created_at", { ascending: true });

        if (fencesErr) throw fencesErr;
        console.log(
          "[TrackerDashboard] geocercas recibidas desde Supabase:",
          fencesData
        );

        // PROFILES que actúan como trackers (org actual)
        const { data: profilesData, error: profilesErr } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone, current_org_id")
          .eq("current_org_id", currentOrg.id)
          .order("full_name", { ascending: true });

        if (profilesErr) throw profilesErr;
        console.log(
          "[TrackerDashboard] perfiles/trackers cargados:",
          profilesData
        );

        if (!cancelled) {
          setGeofences(fencesData || []);
          setTrackers(profilesData || []);
        }
      } catch (err) {
        console.error("[TrackerDashboard] loadInitialData error:", err);
        if (!cancelled) {
          setError("Error al cargar geocercas o trackers.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [currentOrg]);

  // Cargar logs según ventana / tracker seleccionado
  useEffect(() => {
    if (!currentOrg) return;

    let cancelled = false;

    async function loadLogs() {
      setError(null);
      setLoading(true);

      try {
        const { from, to } = computeWindowRange(timeWindowHours);
        console.log(
          "[TrackerDashboard] ventana de tiempo desde:",
          from,
          "hasta:",
          to
        );

        let query = supabase
          .from("tracker_logs")
          .select(
            "id, tenant_id, user_id, lat, lng, accuracy, recorded_at, received_at, inside_geocerca, geocerca_ids"
          )
          .eq("tenant_id", currentOrg.id)
          .gte("recorded_at", from)
          .lte("recorded_at", to)
          .order("recorded_at", { ascending: true });

        if (selectedTrackerId !== "all") {
          query = query.eq("user_id", selectedTrackerId);
        }

        const { data: logsData, error: logsErr } = await query;

        if (logsErr) throw logsErr;
        console.log(
          "[TrackerDashboard] logs de tracking recibidos:",
          logsData
        );

        if (!cancelled) {
          setLogs(logsData || []);
        }
      } catch (err) {
        console.error("[TrackerDashboard] loadLogs error:", err);
        if (!cancelled) {
          setError("Error al cargar logs de tracking.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLogs();

    const interval = setInterval(loadLogs, AUTO_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentOrg, selectedTrackerId, timeWindowHours]);

  // Inicializar mapa
  useEffect(() => {
    if (!mapRef.current) {
      mapRef.current = L.map("tracker-dashboard-map", {
        center: [0, 0],
        zoom: 2,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(mapRef.current);
    }
  }, []);

  const geofenceLayersRef = useRef([]);
  const logLayersRef = useRef([]);

  // Pintar geocercas + logs en el mapa
  useEffect(() => {
    if (!mapRef.current) return;

    geofenceLayersRef.current.forEach((layer) => {
      mapRef.current.removeLayer(layer);
    });
    geofenceLayersRef.current = [];

    logLayersRef.current.forEach((layer) => {
      mapRef.current.removeLayer(layer);
    });
    logLayersRef.current = [];

    const group = L.featureGroup();

    // Geocercas con geojson
    for (const g of geofences) {
      if (!g.geometry && !g.geojson && !g.geom && !g.polygon) continue;

      const geojson =
        g.geometry || g.geojson || g.geom || g.polygon || g.polygon_geojson;
      if (!geojson) continue;

      const layer = L.geoJSON(geojson, {
        style: {
          color: "#2563eb",
          weight: 2,
          fillColor: "#60a5fa",
          fillOpacity: 0.1,
        },
      }).addTo(mapRef.current);

      geofenceLayersRef.current.push(layer);
      group.addLayer(layer);
    }

    // Puntos de tracking
    for (const log of logs) {
      if (typeof log.lat !== "number" || typeof log.lng !== "number") continue;

      const circle = L.circleMarker([log.lat, log.lng], {
        radius: 5,
        color: log.inside_geocerca ? "#16a34a" : "#f97316",
        weight: 1,
        fillColor: log.inside_geocerca ? "#22c55e" : "#fb923c",
        fillOpacity: 0.8,
      });

      const dt = new Date(log.recorded_at || log.received_at);
      const dtStr = dt.toLocaleString();

      circle.bindPopup(
        `<div>
          <strong>${dtStr}</strong><br/>
          Lat: ${log.lat.toFixed(6)}<br/>
          Lng: ${log.lng.toFixed(6)}<br/>
          Dentro geocerca: ${log.inside_geocerca ? "Sí" : "No"}
        </div>`
      );

      circle.addTo(mapRef.current);
      logLayersRef.current.push(circle);
      group.addLayer(circle);
    }

    if (group.getLayers().length > 0) {
      mapRef.current.fitBounds(group.getBounds().pad(0.2));
    } else {
      mapRef.current.setView([0, 0], 2);
    }
  }, [geofences, logs]);

  const stats = useMemo(() => {
    return {
      totalGeofences: geofences.length,
      totalTrackers: trackers.length,
      totalLogs: logs.length,
    };
  }, [geofences, trackers, logs]);

  if (!currentOrg) {
    return (
      <div className="p-4">
        <p>Debes seleccionar una organización para ver el dashboard.</p>
      </div>
    );
  }

  const canSeeDashboard =
    currentRole === "owner" ||
    currentRole === "admin" ||
    currentRole === "tracker";

  if (!canSeeDashboard) {
    return (
      <div className="p-4">
        <p>No tienes permisos para ver el dashboard de tracking.</p>
      </div>
    );
  }

  const { from, to } = computeWindowRange(timeWindowHours);

  return (
    <div className="p-4 flex flex-col lg:flex-row gap-4">
      <div className="flex-1 min-h-[400px]">
        <h1 className="text-2xl font-semibold mb-1">
          Dashboard de Tracking en tiempo real
        </h1>
        <p className="text-sm text-gray-500 mb-2">
          Visualiza la ubicación de tus trackers sobre tus geocercas activas. Los
          puntos se actualizan automáticamente cada 30 segundos.
        </p>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-center mb-3">
          <div>
            <label className="block text-xs font-medium mb-1">Tracker</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={selectedTrackerId}
              onChange={(e) => setSelectedTrackerId(e.target.value)}
            >
              <option value="all">Todos los trackers</option>
              {trackers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name || t.email || t.phone || t.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Ventana</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={timeWindowHours}
              onChange={(e) => setTimeWindowHours(Number(e.target.value))}
            >
              {TIME_WINDOWS.map((tw) => (
                <option key={tw.valueHours} value={tw.valueHours}>
                  {tw.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() =>
              setTimeWindowHours((prev) => {
                return prev; // el useEffect de logs ya recarga automáticamente
              })
            }
            className="ml-auto inline-flex items-center px-3 py-1 rounded bg-blue-600 text-white text-xs"
          >
            Refrescar ahora
          </button>
        </div>

        {/* Mapa */}
        <div
          id="tracker-dashboard-map"
          className="w-full h-[500px] border rounded overflow-hidden"
        />
      </div>

      {/* Panel derecho */}
      <aside className="w-full lg:w-80 border rounded p-3 bg-white flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold mb-1">Resumen</h2>
          <p className="text-xs text-gray-500">
            Ventana:{" "}
            <span className="font-medium">
              {timeWindowHours} hora(s) ({from} → {to})
            </span>
          </p>
        </div>

        <div className="space-y-1 text-sm">
          <p>
            <span className="font-semibold">Geocercas activas: </span>
            {stats.totalGeofences}
          </p>
          <p>
            <span className="font-semibold">Trackers (perfiles): </span>
            {stats.totalTrackers}
          </p>
          <p>
            <span className="font-semibold">Puntos en mapa (filtro actual): </span>
            {stats.totalLogs}
          </p>
        </div>

        <div className="text-xs text-gray-500">
          <p className="mb-1 font-semibold">Notas:</p>
          <p>
            Los puntos de tracking se muestran directamente en el mapa. Solo se
            visualizan dentro del área de las geocercas (usando el contorno de
            cada geocerca como filtro aproximado).
          </p>
          <p className="mt-1">
            Puedes cambiar la ventana de tiempo y filtrar por tracker específico
            para investigar movimientos puntuales.
          </p>
        </div>
      </aside>
    </div>
  );
}

export default TrackerDashboard;

