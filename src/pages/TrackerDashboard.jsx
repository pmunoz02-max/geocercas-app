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
// Icono simple para los puntos de tracker
const trackerIcon = new L.Icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function TrackerDashboard() {
  const { user, currentOrg, currentRole } = useAuth();

  // ---------------------------
  // Control de permisos
  // ---------------------------

  const normalizedRole = (currentRole || "")
    .toString()
    .trim()
    .toLowerCase();

  console.log("[TrackerDashboard] currentRole normalizado:", normalizedRole);

  // Si no hay usuario autenticado, este componente no debe mostrar
  // el mensaje de organización. Dejamos que el flujo de login
  // muestre la pantalla correspondiente.
  if (!user) {
    return null;
  }

  // Usuario autenticado pero sin organización seleccionada
  if (!currentOrg) {
    return (
      <div className="p-4">
        <p>Debes seleccionar una organización para ver el dashboard.</p>
      </div>
    );
  }

  // ---------------------------
  // Estado de UI / datos
  // ---------------------------

  const [timeWindowHours, setTimeWindowHours] = useState(6);
  const [selectedTrackerId, setSelectedTrackerId] = useState("all");

  const [geocercas, setGeocercas] = useState([]);
  const [trackerProfiles, setTrackerProfiles] = useState([]);
  const [positions, setPositions] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Refs para Leaflet
  const mapInstanceRef = useRef(null);
  const mapContainerRef = useRef(null);
  const geofencesLayerRef = useRef(null);
  const markersLayerRef = useRef(null);

  // Ventana de tiempo [from, to] en ISO
  const { from, to } = useMemo(() => {
    const now = new Date();
    const toIso = now.toISOString();
    const fromDate = new Date(
      now.getTime() - timeWindowHours * 60 * 60 * 1000
    );
    const fromIso = fromDate.toISOString();

    console.log(
      "[TrackerDashboard] ventana de tiempo desde:",
      fromIso,
      "hasta:",
      toIso
    );

    return { from: fromIso, to: toIso };
  }, [timeWindowHours]);

  // ---------------------------
  // Inicializar mapa Leaflet
  // ---------------------------

  useEffect(() => {
    if (mapInstanceRef.current || !mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [-0.9, -78.5], // Ecuador aprox
      zoom: 7,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const geofencesLayer = L.layerGroup().addTo(map);
    const markersLayer = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    geofencesLayerRef.current = geofencesLayer;
    markersLayerRef.current = markersLayer;
  }, []);

  // ---------------------------
  // Carga de datos (geocercas, trackers, posiciones)
  // ---------------------------

  useEffect(() => {
    if (!currentOrg?.id) return;

    console.log(
      "[TrackerDashboard] tenantId usado (currentOrg.id):",
      currentOrg.id
    );

    let cancelled = false;

    async function loadData() {
      if (cancelled) return;

      setLoading(true);
      setError(null);

      try {
        // 1) Geocercas activas y visibles
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

        // 2) Perfiles / trackers asociados al tenant
        const { data: profilesData, error: profilesErr } = await supabase
          .from("profiles")
          .select("id, full_name, email, org_id, tenant_id, user_id")
          .or(`org_id.eq.${currentOrg.id},tenant_id.eq.${currentOrg.id}`)
          .order("full_name", { ascending: true });

        if (profilesErr) throw profilesErr;

        console.log(
          "[TrackerDashboard] perfiles/trackers cargados:",
          profilesData
        );

        // 3) Posiciones desde tracker_logs
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

        let { data: logsData, error: logsErr } = await query;

        if (logsErr) {
          console.warn(
            "[TrackerDashboard] error en query principal de tracker_logs, intentando fallback *.select('*'):",
            logsErr
          );
          const {
            data: fallbackData,
            error: fallbackErr,
          } = await supabase.from("tracker_logs").select("*");

          if (fallbackErr) throw fallbackErr;
          logsData = fallbackData;
        }

        console.log(
          "[TrackerDashboard] posiciones recientes recibidas:",
          logsData
        );

        // Normalizar posiciones
        const normalizedPositions = (logsData || [])
          .map((log) => {
            const lat =
              log.lat ?? log.latitude ?? log.latitud ?? log.latitud_decimal ?? null;
            const lng =
              log.lng ??
              log.longitude ??
              log.longitud ??
              log.longitud_decimal ??
              null;

            if (typeof lat !== "number" || typeof lng !== "number") {
              return null;
            }

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

            return {
              id: log.id,
              user_id: log.user_id,
              lat,
              lng,
              accuracy: log.accuracy ?? null,
              inside,
              recorded_at: ts,
              recorded_date: dt,
            };
          })
          .filter(Boolean);

        if (!cancelled) {
          setGeocercas(fencesData || []);
          setTrackerProfiles(profilesData || []);
          setPositions(normalizedPositions);
        }
      } catch (e) {
        console.error("[TrackerDashboard] error general loadData:", e);
        if (!cancelled) {
          setError(
            e?.message ||
              "Error cargando datos de tracking. Revisa la consola."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    // Primera carga inmediata
    loadData();

    // Auto–refresh
    const intervalId = setInterval(loadData, AUTO_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentOrg?.id, selectedTrackerId, from, to]);

  // ---------------------------
  // Pintar geocercas y puntos en el mapa
  // ---------------------------

  useEffect(() => {
    const map = mapInstanceRef.current;
    const geofencesLayer = geofencesLayerRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !geofencesLayer || !markersLayer) return;

    geofencesLayer.clearLayers();
    markersLayer.clearLayers();

    // Geocercas
    geocercas.forEach((g) => {
      if (!g.geojson && !g.leaflet_geojson && !g.geoman_json) return;

      const raw =
        g.geojson || g.leaflet_geojson || g.geoman_json || null;

      if (!raw) return;

      try {
        const gj =
          typeof raw === "string" ? JSON.parse(raw) : raw;
        const layer = L.geoJSON(gj, {
          style: {
            color: "#ff7800",
            weight: 2,
            fillOpacity: 0.1,
          },
        });
        layer.addTo(geofencesLayer);
      } catch (err) {
        console.error(
          "[TrackerDashboard] GeoJSON inválido al crear layer, se omite. id:",
          g.id,
          "error:",
          err
        );
      }
    });

    // Puntos de tracking
    positions.forEach((p) => {
      const marker = L.marker([p.lat, p.lng], { icon: trackerIcon });

      const trackerProfile = trackerProfiles.find(
        (tp) => tp.user_id === p.user_id || tp.id === p.user_id
      );

      const label =
        trackerProfile?.full_name ||
        trackerProfile?.email ||
        p.user_id ||
        "Tracker";

      const ts = p.recorded_date
        ? p.recorded_date.toLocaleString()
        : p.recorded_at || "";

      marker.bindPopup(
        `<div>
          <strong>${label}</strong><br/>
          ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}<br/>
          <small>${ts}</small>
        </div>`
      );

      marker.addTo(markersLayer);
    });

    // Ajustar bounds si hay puntos
    if (positions.length > 0) {
      const latlngs = positions.map((p) => [p.lat, p.lng]);
      const bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [geocercas, positions, trackerProfiles]);

  // ---------------------------
  // Cálculos de resumen
  // ---------------------------

  const resumen = useMemo(() => {
    const totalGeocercas = geocercas.length;
    const totalTrackers = trackerProfiles.length;
    const totalPuntos = positions.length;

    const ultimo =
      positions.length > 0
        ? positions[positions.length - 1]
        : null;

    const ultimoTs = ultimo?.recorded_date
      ? ultimo.recorded_date.toLocaleString()
      : ultimo?.recorded_at || null;

    return {
      totalGeocercas,
      totalTrackers,
      totalPuntos,
      ultimoTs,
    };
  }, [geocercas, trackerProfiles, positions]);

  // ---------------------------
  // Render
  // ---------------------------

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4">
      {/* Columna principal */}
      <div className="flex-1 flex flex-col gap-3">
        <header>
          <h1 className="text-2xl font-semibold mb-1">
            Dashboard de Tracking en tiempo real
          </h1>
          <p className="text-sm text-gray-600 max-w-2xl">
            Los puntos se actualizan automáticamente.
            <br />
            La frecuencia de envío configurada para esta asignación es de 5 minutos.
            <br />
            La ventana de tiempo la define el administrador.
          </p>
        </header>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600">
              Tracker
            </label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={selectedTrackerId}
              onChange={(e) =>
                setSelectedTrackerId(e.target.value)
              }
            >
              <option value="all">Todos los trackers</option>
              {trackerProfiles.map((tp) => (
                <option
                  key={tp.id}
                  value={tp.user_id || tp.id}
                >
                  {tp.full_name || tp.email || tp.user_id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600">
              Ventana (horas)
            </label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={timeWindowHours}
              onChange={(e) =>
                setTimeWindowHours(Number(e.target.value))
              }
            >
              {TIME_WINDOWS.map((tw) => (
                <option
                  key={tw.valueHours}
                  value={tw.valueHours}
                >
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
            Ventana:{" "}
            <span className="font-medium">
              {timeWindowHours} hora(s) ({from} → {to})
            </span>
          </p>
        </div>

        <div className="space-y-1 text-sm">
          <p>
            <span className="font-medium">
              Geocercas activas:
            </span>{" "}
            {resumen.totalGeocercas}
          </p>
          <p>
            <span className="font-medium">
              Trackers (perfiles):
            </span>{" "}
            {resumen.totalTrackers}
          </p>
          <p>
            <span className="font-medium">
              Puntos en mapa (filtro actual):
            </span>{" "}
            {resumen.totalPuntos}
          </p>
          {resumen.ultimoTs && (
            <p className="text-xs text-gray-500">
              Último punto registrado:{" "}
              <span className="font-medium">
                {resumen.ultimoTs}
              </span>
            </p>
          )}
        </div>

        {loading && (
          <p className="text-xs text-blue-600">
            Cargando datos de tracking…
          </p>
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
