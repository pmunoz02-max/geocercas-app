// src/pages/TrackerDashboard.jsx
import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

const AUTO_REFRESH_MS = 30_000; // refresco automático cada 30s

// Ventanas de tiempo que puede escoger el administrador (en horas)
const TIME_WINDOWS = [
  { label: "1 hora", valueHours: 1 },
  { label: "3 horas", valueHours: 3 },
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

  // ventana que escoge el admin (en horas)
  const [timeWindowHours, setTimeWindowHours] = useState(6);
  const [selectedTrackerId, setSelectedTrackerId] = useState("all");

  const [geofences, setGeofences] = useState([]);
  const [trackers, setTrackers] = useState([]);
  const [logs, setLogs] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const geofenceLayersRef = useRef([]);
  const logLayersRef = useRef([]);

  // ---------------------------
  // Carga de geocercas + perfiles
  // ---------------------------
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
        // Geocercas activas/visibles de la organización actual
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

        // Perfiles asociados a la organización (para el dropdown de trackers)
        const { data: profilesData, error: profilesErr } = await supabase
          .from("profiles")
          .select("id, full_name, email, org_id, tenant_id")
          .or(`org_id.eq.${currentOrg.id},tenant_id.eq.${currentOrg.id}`)
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

  // ---------------------------
  // Carga de logs desde latest_positions_by_user
  // (usa ventana de tiempo elegida por el administrador)
  // ---------------------------
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

        // Base: última posición por usuario dentro de la organización y ventana de tiempo
        let query = supabase
          .from("latest_positions_by_user")
          .select(
            `
            id,
            org_id,
            user_id,
            personal_id,
            asignacion_id,
            lat,
            lng,
            accuracy,
            speed,
            heading,
            battery,
            is_mock,
            source,
            recorded_at,
            created_at,
            age_minutes
          `
          )
          .eq("org_id", currentOrg.id)
          .gte("recorded_at", from)
          .lte("recorded_at", to)
          .order("recorded_at", { ascending: true });

        // Filtro opcional por tracker concreto
        if (selectedTrackerId !== "all") {
          query = query.eq("user_id", selectedTrackerId);
        }

        const { data: logsData, error: logsErr } = await query;

        if (logsErr) {
          throw logsErr;
        }

        console.log(
          "[TrackerDashboard] posiciones recientes recibidas:",
          logsData
        );

        if (!cancelled) {
          setLogs(logsData || []);
        }
      } catch (err) {
        console.error("[TrackerDashboard] loadLogs error:", err);
        if (!cancelled) {
          setError("Error al cargar datos de tracking.");
          setLogs([]);
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

  // ---------------------------
  // Inicializar mapa
  // ---------------------------
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [0, 0],
      zoom: 2,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // ---------------------------
  // Pintar geocercas + logs en el mapa
  // ---------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Limpiar capas anteriores
    geofenceLayersRef.current.forEach((layer) => map.removeLayer(layer));
    geofenceLayersRef.current = [];

    logLayersRef.current.forEach((layer) => map.removeLayer(layer));
    logLayersRef.current = [];

    const group = L.featureGroup();

    // Geocercas con manejo de GeoJSON inválido
    for (const g of geofences) {
      if (!g) continue;

      let geojson =
        g.geometry ||
        g.geojson ||
        g.geom ||
        g.polygon ||
        g.polygon_geojson;

      if (!geojson) {
        continue;
      }

      // Si viene como texto, intentamos parsear
      if (typeof geojson === "string") {
        try {
          geojson = JSON.parse(geojson);
        } catch (e) {
          console.warn(
            "[TrackerDashboard] GeoJSON de geocerca no es JSON válido, se omite. id:",
            g.id,
            "valor:",
            geojson
          );
          continue;
        }
      }

      // GeoJSON debe ser objeto
      if (typeof geojson !== "object" || geojson === null) {
        console.warn(
          "[TrackerDashboard] GeoJSON de geocerca no es objeto, se omite. id:",
          g.id,
          "valor:",
          geojson
        );
        continue;
      }

      try {
        const layer = L.geoJSON(geojson, {
          style: {
            color: "#2563eb",
            weight: 2,
            fillColor: "#60a5fa",
            fillOpacity: 0.1,
          },
        }).addTo(map);

        geofenceLayersRef.current.push(layer);
        group.addLayer(layer);
      } catch (e) {
        console.error(
          "[TrackerDashboard] GeoJSON inválido al crear layer, se omite. id:",
          g.id,
          "error:",
          e
        );
        continue;
      }
    }

    // Logs / puntos de tracking (ahora provenientes de latest_positions_by_user)
    for (const log of logs) {
      if (!log) continue;

      const lat =
        log.lat ??
        log.latitude ??
        log.latitud ??
        log.latitud_decimal ??
        null;
      const lng =
        log.lng ??
        log.longitude ??
        log.longitud ??
        log.longitud_decimal ??
        null;

      if (typeof lat !== "number" || typeof lng !== "number") continue;

      // Por ahora inside_geocerca se deja opcional (lo añadiremos en positions más adelante)
      const inside =
        log.inside_geocerca ??
        log.inside ??
        log.inside_geofence ??
        false;

      const ts =
        log.recorded_at ??
        log.received_at ??
        log.created_at ??
        log.timestamp ??
        null;

      const dt = ts ? new Date(ts) : null;
      const dtStr = dt ? dt.toLocaleString() : "(sin fecha)";

      const ageMinutes =
        typeof log.age_minutes === "number" ? log.age_minutes : null;

      const circle = L.circleMarker([lat, lng], {
        radius: 6,
        color: inside ? "#16a34a" : "#f97316",
        weight: 1,
        fillColor: inside ? "#22c55e" : "#fb923c",
        fillOpacity: 0.8,
      });

      circle.bindPopup(
        `<div>
          <strong>${dtStr}</strong><br/>
          Lat: ${lat.toFixed(6)}<br/>
          Lng: ${lng.toFixed(6)}<br/>
          Dentro geocerca: ${inside ? "Sí" : "No"}<br/>
          ${
            ageMinutes !== null
              ? `Antigüedad: ${ageMinutes.toFixed(1)} min`
              : ""
          }
        </div>`
      );

      circle.addTo(map);
      logLayersRef.current.push(circle);
      group.addLayer(circle);
    }

    if (group.getLayers().length > 0) {
      map.fitBounds(group.getBounds().pad(0.2));
    } else {
      map.setView([0, 0], 2);
    }
  }, [geofences, logs]);

  const stats = useMemo(
    () => ({
      totalGeofences: geofences.length,
      totalTrackers: trackers.length,
      totalLogs: logs.length,
    }),
    [geofences, trackers, logs]
  );

  // ---------------------------
  // Control de permisos
  // ---------------------------
  if (!currentOrg) {
    return (
      <div className="p-4">
        <p>Debes seleccionar una organización para ver el dashboard.</p>
      </div>
    );
  }

  const normalizedRole = (currentRole || "")
    .toString()
    .trim()
    .toLowerCase();

  console.log("[TrackerDashboard] currentRole normalizado:", normalizedRole);

  const canSeeDashboard =
    !normalizedRole ||
    ["owner", "admin", "tracker"].includes(normalizedRole);

  if (!canSeeDashboard) {
    return (
      <div className="p-4">
        <p>No tienes permisos para ver el dashboard de tracking.</p>
      </div>
    );
  }

  const { from, to } = computeWindowRange(timeWindowHours);

  // ---------------------------
  // Render
  // ---------------------------
  return (
    <div className="p-4 flex flex-col lg:flex-row gap-4">
      <div className="flex-1 min-h-[400px]">
        <h1 className="text-2xl font-semibold mb-1">
          Dashboard de Tracking en tiempo real
        </h1>
        <p className="text-sm text-gray-500 mb-2">
          Visualiza la ubicación de tus trackers sobre tus geocercas activas. Los
          puntos se actualizan automáticamente cada 30 segundos. La ventana de
          tiempo es escogida por el administrador.
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
                  {t.full_name || t.email || t.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              Ventana (horas)
            </label>
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
        </div>

        {/* Mapa */}
        <div className="w-full h-[500px] border rounded overflow-hidden">
          <div ref={mapContainerRef} className="w-full h-full" />
        </div>
      </div>

      {/* Panel derecho */}
      <aside className="w-full lg:w-80 border rounded p-3 bg-white flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold mb-1">Resumen</h2>
          <p className="text-xs text-gray-500">
            Ventana seleccionada:{" "}
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
            <span className="font-semibold">
              Puntos en mapa (filtro actual):{" "}
            </span>
            {stats.totalLogs}
          </p>
        </div>

        {loading && (
          <p className="text-xs text-blue-600">Cargando datos de tracking…</p>
        )}
        {error && (
          <p className="text-xs text-red-600">
            {error} Revisa la consola si persiste.
          </p>
        )}
      </aside>
    </div>
  );
}

export default TrackerDashboard;
