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

const TRACKER_COLORS = [
  "#007AFF",
  "#FF3B30",
  "#34C759",
  "#FF9500",
  "#AF52DE",
  "#5856D6",
  "#FF2D55",
];

function TrackerDashboard() {
  const { user, currentOrg } = useAuth();

  if (!user) return null;
  if (!currentOrg) {
    return <div className="p-4">Debes seleccionar una organización.</div>;
  }

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
    const fromIso = new Date(
      now.getTime() - timeWindowHours * 3600000
    ).toISOString();
    return { from: fromIso, to: toIso };
  }, [timeWindowHours]);

  // Inicializar mapa Leaflet una sola vez
  useEffect(() => {
    if (mapInstanceRef.current || !mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [-0.9, -78.5],
      zoom: 8,
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

  // Cargar datos periódicamente
  useEffect(() => {
    if (!currentOrg?.id) return;

    let cancelled = false;

    async function loadData() {
      if (cancelled) return;

      try {
        setLoading(true);
        setError(null);

        // 1) Geocercas activas visibles
        const { data: fencesData, error: fencesErr } = await supabase
          .from("geocercas")
          .select("*")
          .eq("org_id", currentOrg.id)
          .eq("visible", true)
          .eq("activa", true);

        if (fencesErr) throw fencesErr;

        // 2) Perfiles de trackers (id es el user_id real)
        const { data: profilesData, error: profilesErr } = await supabase
          .from("profiles")
          .select("id, full_name, email, org_id, tenant_id")
          .or(`org_id.eq.${currentOrg.id},tenant_id.eq.${currentOrg.id}`)
          .order("full_name", { ascending: true });

        if (profilesErr) throw profilesErr;

        // 3) Logs de tracking
        let query = supabase
          .from("tracker_logs")
          .select(
            "id, tenant_id, user_id, lat, lng, accuracy, recorded_at, received_at"
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

        // Normalizar posiciones
        const normalized = (logsData || [])
          .map((log) => {
            if (typeof log.lat !== "number" || typeof log.lng !== "number") {
              return null;
            }
            const ts = log.recorded_at || log.received_at;
            return {
              ...log,
              recorded_date: ts ? new Date(ts) : null,
            };
          })
          .filter(Boolean);

        if (!cancelled) {
          setGeocercas(fencesData || []);
          setTrackerProfiles(profilesData || []);
          setPositions(normalized);
        }
      } catch (e) {
        if (!cancelled)
          setError(e.message || "Error cargando datos de tracking.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    const id = setInterval(loadData, AUTO_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [currentOrg?.id, selectedTrackerId, from, to]);

  // Agrupar posiciones por tracker (universal)
  const trackerGroups = useMemo(() => {
    if (!positions || positions.length === 0) return [];

    const groups = new Map();

    positions.forEach((p) => {
      const trackerId = p.user_id || "desconocido";
      if (!groups.has(trackerId)) groups.set(trackerId, []);
      groups.get(trackerId).push(p);
    });

    const trackerIds = Array.from(groups.keys()).sort();

    return trackerIds.map((trackerId, index) => {
      const pts = groups.get(trackerId) || [];

      // Orden cronológico
      pts.sort((a, b) => {
        const ta = a.recorded_date?.getTime() || 0;
        const tb = b.recorded_date?.getTime() || 0;
        return ta - tb;
      });

      // Emparejar con perfil usando id (user_id real)
      const profile = trackerProfiles.find((tp) => tp.id === trackerId);

      const label = profile?.full_name || profile?.email || trackerId;
      const color = TRACKER_COLORS[index % TRACKER_COLORS.length];

      const last = pts[pts.length - 1];
      const lastTs =
        last?.recorded_date?.toLocaleString() || last?.recorded_at || null;

      return {
        trackerId,
        label,
        color,
        points: pts,
        lastTs,
      };
    });
  }, [positions, trackerProfiles]);

  // Filtrar geocercas por selección
  const geocercasFiltradas = useMemo(() => {
    if (selectedGeocercaId === "all") return geocercas;
    return geocercas.filter((g) => String(g.id) === String(selectedGeocercaId));
  }, [geocercas, selectedGeocercaId]);

  // Pintar mapa cada vez que cambian datos
  useEffect(() => {
    const map = mapInstanceRef.current;
    const geofencesLayer = geofencesLayerRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !geofencesLayer || !markersLayer) return;

    geofencesLayer.clearLayers();
    markersLayer.clearLayers();

    // Geocercas
    geocercasFiltradas.forEach((g) => {
      const raw = g.geojson || g.leaflet_geojson || g.geoman_json;
      if (!raw) return;
      try {
        const gj = typeof raw === "string" ? JSON.parse(raw) : raw;
        L.geoJSON(gj, {
          style: { color: "#ff7800", weight: 2, fillOpacity: 0.1 },
        }).addTo(geofencesLayer);
      } catch {
        // ignorar errores de parseo
      }
    });

    // Trackers
    const allLatLngs = [];

    trackerGroups.forEach((group) => {
      const { color, points, label } = group;

      // Mapa auxiliar para contar puntos por posición (lat/lng) aproximada
      const posCounts = new Map();
      points.forEach((p) => {
        const key = `${p.lat.toFixed(6)}|${p.lng.toFixed(6)}`;
        posCounts.set(key, (posCounts.get(key) || 0) + 1);
      });

      const latlngs = points.map((p) => {
        const ll = [p.lat, p.lng];
        allLatLngs.push(ll);
        return ll;
      });

      // Dibujar puntos individuales
      points.forEach((p, idx) => {
        const isLast = idx === points.length - 1;
        const key = `${p.lat.toFixed(6)}|${p.lng.toFixed(6)}`;
        const countHere = posCounts.get(key) || 1;

        const circle = L.circleMarker([p.lat, p.lng], {
          radius: isLast ? 7 : 5,
          weight: isLast ? 2 : 1,
          fillOpacity: 0.9,
          color,
          fillColor: color,
        }).addTo(markersLayer);

        const hora =
          p.recorded_date?.toLocaleString() || p.recorded_at || "sin hora";

        circle.bindPopup(
          `<div style="font-size:12px;">
             <div><strong>Tracker:</strong> ${label}</div>
             <div><strong>Hora:</strong> ${hora}</div>
             <div><strong>Accuracy:</strong> ${
               p.accuracy ?? "–"
             } m</div>
             <div><strong>Registros en esta posición:</strong> ${countHere}</div>
           </div>`
        );
      });

      // Dibujar ruta (polyline con TODOS los puntos de ese tracker)
      if (latlngs.length > 1) {
        L.polyline(latlngs, { weight: 3, color }).addTo(markersLayer);
      }
    });

    // Ajustar mapa a todos los puntos
    if (allLatLngs.length > 0) {
      const bounds = L.latLngBounds(allLatLngs);
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [geocercasFiltradas, trackerGroups]);

  // Resumen general
  const resumen = useMemo(() => {
    const ultimo = positions[positions.length - 1];
    return {
      totalGeocercas: geocercas.length,
      totalTrackers: trackerProfiles.length,
      totalPuntos: positions.length,
      ultimoTs:
        ultimo?.recorded_date?.toLocaleString() || ultimo?.recorded_at || null,
    };
  }, [positions, trackerProfiles, geocercas]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4">
      <div className="flex-1 flex flex-col gap-3">
        <header>
          <h1 className="text-2xl font-semibold mb-1">
            Dashboard de Tracking en tiempo real
          </h1>
          <p className="text-xs text-gray-600">
            Los puntos se actualizan automáticamente. La frecuencia de envío la
            define el administrador.
          </p>
        </header>

        {/* Filtros */}
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-gray-600 block mb-1">Tracker</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={selectedTrackerId}
              onChange={(e) => setSelectedTrackerId(e.target.value)}
            >
              <option value="all">Todos los trackers</option>
              {trackerProfiles.map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.full_name || tp.email || tp.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-600 block mb-1">
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

          <div>
            <label className="text-xs text-gray-600 block mb-1">Geocerca</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
            >
              <option value="all">Todas</option>
              {geocercas.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre || `Geocerca ${g.id}`}
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

      {/* Panel derecho: resumen + leyenda */}
      <aside className="w-full lg:w-80 border rounded p-3 bg-white flex flex-col gap-3">
        <h2 className="text-lg font-semibold mb-1">Resumen</h2>

        <p className="text-sm">
          <b>Geocercas activas:</b> {resumen.totalGeocercas}
        </p>
        <p className="text-sm">
          <b>Trackers (perfiles):</b> {resumen.totalTrackers}
        </p>
        <p className="text-sm">
          <b>Puntos en mapa (filtro actual):</b> {resumen.totalPuntos}
        </p>
        <p className="text-sm">
          <b>Último punto registrado:</b> {resumen.ultimoTs || "-"}
        </p>

        <div className="mt-3">
          <p className="text-xs font-semibold mb-1">Leyenda de trackers</p>
          <ul className="space-y-1">
            {trackerGroups.map((g) => (
              <li
                key={g.trackerId}
                className="flex items-center gap-2 text-xs"
              >
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: g.color }}
                />
                <span className="truncate max-w-[140px]" title={g.label}>
                  {g.label}
                </span>
                <span className="ml-auto text-[10px] text-gray-500">
                  {g.points.length} pts
                </span>
              </li>
            ))}
          </ul>
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
