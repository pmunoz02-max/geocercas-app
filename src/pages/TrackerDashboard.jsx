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

function TrackerDashboard() {
  const { user, currentOrg, currentRole } = useAuth();

  const normalizedRole = (currentRole || "").toString().trim().toLowerCase();
  console.log("[TrackerDashboard] currentRole normalizado:", normalizedRole);

  if (!user) return null;

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
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("all");

  const [geocercas, setGeocercas] = useState([]);
  const [trackerProfiles, setTrackerProfiles] = useState([]);
  const [positions, setPositions] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Refs Leaflet
  const mapInstanceRef = useRef(null);
  const mapContainerRef = useRef(null);
  const geofencesLayerRef = useRef(null);
  const markersLayerRef = useRef(null);

  // Ventana de tiempo [from, to] en ISO (para recorded_at)
  const { from, to } = useMemo(() => {
    const now = new Date();
    const toIso = now.toISOString();
    const fromDate = new Date(now.getTime() - timeWindowHours * 60 * 60 * 1000);
    const fromIso = fromDate.toISOString();

    console.log(
      "[TrackerDashboard] ventana de tiempo (recorded_at) desde:",
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
      attribution: "&copy; OpenStreetMap contributors",
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
        // 1) Geocercas activas y visibles de la org
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

        // 2) Perfiles / trackers de la organización
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

        // 3) Posiciones desde tracker_logs, filtradas por tenant y recorded_at
        let query = supabase
          .from("tracker_logs")
          .select(
            "id, tenant_id, user_id, lat, lng, accuracy, recorded_at, received_at"
          )
          .eq("tenant_id", currentOrg.id)
          .gte("recorded_at", from)
          .lte("recorded_at", to)
          .order("recorded_at", { ascending: true }); // <-- orden cronológico

        if (selectedTrackerId !== "all") {
          query = query.eq("user_id", selectedTrackerId);
        }

        const { data: logsData, error: logsErr } = await query;

        if (logsErr) {
          console.error(
            "[TrackerDashboard] error al cargar tracker_logs:",
            logsErr
          );
          throw logsErr;
        }

        console.log(
          "[TrackerDashboard] posiciones recientes recibidas:",
          logsData
        );

        // Normalizar posiciones
        const normalizedPositions = (logsData || [])
          .map((log) => {
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

            if (typeof lat !== "number" || typeof lng !== "number") {
              return null;
            }

            const ts =
              log.recorded_at ??
              log.received_at ??
              log.ts ??
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
            e?.message || "Error cargando datos de tracking. Revisa la consola."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    // Primera carga
    loadData();

    // Auto–refresh
    const intervalId = setInterval(loadData, AUTO_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentOrg?.id, selectedTrackerId, from, to]);

  // ---------------------------
  // Agrupar posiciones por tracker + colores + datos de leyenda
  // ---------------------------

  const trackerGroups = useMemo(() => {
    if (!positions || positions.length === 0) return [];

    const groups = new Map();

    positions.forEach((p) => {
      const trackerId = p.user_id || "desconocido";
      if (!groups.has(trackerId)) groups.set(trackerId, []);
      groups.get(trackerId).push(p);
    });

    // Orden estable de trackers (alfabético por id)
    const trackerIds = Array.from(groups.keys()).sort();

    return trackerIds.map((trackerId, index) => {
      const pts = groups.get(trackerId) || [];

      // Orden cronológico por seguridad
      pts.sort((a, b) => {
        const ta = a.recorded_date?.getTime() || 0;
        const tb = b.recorded_date?.getTime() || 0;
        return ta - tb;
      });

      const profile = trackerProfiles.find(
        (tp) => tp.user_id === trackerId || tp.id === trackerId
      );

      const label =
        profile?.full_name || profile?.email || trackerId || "Tracker";

      const color = TRACKER_COLORS[index % TRACKER_COLORS.length];

      const last = pts.length > 0 ? pts[pts.length - 1] : null;
      const lastTs = last?.recorded_date
        ? last.recorded_date.toLocaleString()
        : last?.recorded_at || null;

      return {
        trackerId,
        label,
        color,
        points: pts,
        lastTs,
      };
    });
  }, [positions, trackerProfiles]);

  // ---------------------------
  // Geocercas filtradas por dropdown
  // ---------------------------

  const geocercasFiltradas = useMemo(() => {
    if (selectedGeocercaId === "all") return geocercas;
    return geocercas.filter((g) => String(g.id) === String(selectedGeocercaId));
  }, [geocercas, selectedGeocercaId]);

  // ---------------------------
  // Pintar geocercas y puntos/rutas en el mapa
  // ---------------------------

  useEffect(() => {
    const map = mapInstanceRef.current;
    const geofencesLayer = geofencesLayerRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !geofencesLayer || !markersLayer) return;

    geofencesLayer.clearLayers();
    markersLayer.clearLayers();

    // Geocercas filtradas
    geocercasFiltradas.forEach((g) => {
      if (!g.geojson && !g.leaflet_geojson && !g.geoman_json) return;

      const raw = g.geojson || g.leaflet_geojson || g.geoman_json || null;
      if (!raw) return;

      try {
        const gj = typeof raw === "string" ? JSON.parse(raw) : raw;
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

    // Puntos y rutas por tracker
    const allLatLngs = [];

    trackerGroups.forEach((group) => {
      const { color, points, label, trackerId } = group;

      const latlngs = points.map((p) => {
        const ll = [p.lat, p.lng];
        allLatLngs.push(ll);
        return ll;
      });

      // Puntos (último más grande)
      points.forEach((p, idx) => {
        const isLast = idx === points.length - 1;
        const latlng = [p.lat, p.lng];

        const ts = p.recorded_date
          ? p.recorded_date.toLocaleString()
          : p.recorded_at || "";

        const circle = L.circleMarker(latlng, {
          radius: isLast ? 7 : 5,
          weight: isLast ? 2 : 1,
          fillOpacity: 0.9,
          color,
          fillColor: color,
        });

        circle.bindPopup(
          `<div>
             <strong>${label}</strong><br/>
             ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}<br/>
             <small>${ts}</small><br/>
             <small>ID: ${trackerId}</small>
           </div>`
        );

        circle.addTo(markersLayer);
      });

      // Ruta cronológica
      if (latlngs.length > 1) {
        const polyline = L.polyline(latlngs, { weight: 3, color });
        polyline.addTo(markersLayer);
      }
    });

    // Ajustar bounds si hay puntos
    if (allLatLngs.length > 0) {
      const bounds = L.latLngBounds(allLatLngs);
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [geocercasFiltradas, trackerGroups]);

  // ---------------------------
  // Resumen
  // ---------------------------

  const resumen = useMemo(() => {
    const totalGeocercas = geocercas.length;
    const totalTrackers = trackerProfiles.length;
    const totalPuntos = positions.length;

    const ultimo =
      positions.length > 0 ? positions[positions.length - 1] : null;

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
            La frecuencia de envío configurada para esta asignación es de 5
            minutos.
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
              onChange={(e) => setSelectedTrackerId(e.target.value)}
            >
              <option value="all">Todos los trackers</option>
              {trackerProfiles.map((tp) => (
                <option key={tp.id} value={tp.user_id || tp.id}>
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
              onChange={(e) => setTimeWindowHours(Number(e.target.value))}
            >
              {TIME_WINDOWS.map((tw) => (
                <option key={tw.valueHours} value={tw.valueHours}>
                  {tw.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600">
              Geocerca
            </label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
            >
              <option value="all">Todas las geocercas</option>
              {geocercas.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre || g.name || `Geocerca ${g.id}`}
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
            <span className="font-medium">Geocercas activas:</span>{" "}
            {resumen.totalGeocercas}
          </p>
          <p>
            <span className="font-medium">Trackers (perfiles):</span>{" "}
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
              <span className="font-medium">{resumen.ultimoTs}</span>
            </p>
          )}
        </div>

        {/* Leyenda de colores por tracker */}
        {trackerGroups.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-semibold text-gray-700 mb-1">
              Leyenda de trackers
            </p>
            <ul className="space-y-1">
              {trackerGroups.map((g) => (
                <li
                  key={g.trackerId}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ backgroundColor: g.color }}
                    />
                    <span className="font-medium truncate max-w-[9rem]">
                      {g.label}
                    </span>
                  </div>
                  {g.lastTs && (
                    <span className="text-[10px] text-gray-500 text-right">
                      Último: {g.lastTs}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

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
