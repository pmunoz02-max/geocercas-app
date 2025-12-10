// src/pages/TrackerDashboard.jsx
// Dashboard de tracking en tiempo real
//
// Este componente obtiene el `orgId` desde el AuthProvider (useAuth):
//   const { currentOrg } = useAuth();
//   const orgId = currentOrg;
//
// No hace filtrados raros: dibuja lo que venga de
// `v_positions_with_activity` y aplica solo filtros visuales.

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

// 👇 Ruta corregida, igual que en AuthProvider
import { supabase } from "../supabaseClient";

import { useAuth } from "@/context/AuthProvider";

const TIME_WINDOWS = [
  { id: "1h", label: "1 hora", ms: 1 * 60 * 60 * 1000 },
  { id: "6h", label: "6 horas", ms: 6 * 60 * 60 * 1000 },
  { id: "12h", label: "12 horas", ms: 12 * 60 * 60 * 1000 },
  { id: "24h", label: "24 horas", ms: 24 * 60 * 60 * 1000 },
];

const TRACKER_COLORS = [
  "#2563eb", // azul
  "#16a34a", // verde
  "#f97316", // naranja
  "#dc2626", // rojo
  "#7c3aed", // violeta
  "#0d9488", // teal
];

function formatDateTime(dtString) {
  if (!dtString) return "-";
  try {
    const d = new Date(dtString);
    return d.toLocaleString();
  } catch {
    return dtString;
  }
}

function formatTime(dtString) {
  if (!dtString) return "-";
  try {
    const d = new Date(dtString);
    return d.toLocaleTimeString();
  } catch {
    return dtString;
  }
}

export default function TrackerDashboard() {
  // 🔹 Organización activa desde AuthProvider
  const { currentOrg } = useAuth();
  const orgId = currentOrg || null;

  const [loading, setLoading] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [timeWindowId, setTimeWindowId] = useState("6h");
  const [selectedTrackerId, setSelectedTrackerId] = useState("all");
  const [selectedGeofenceId, setSelectedGeofenceId] = useState("all");

  const [positions, setPositions] = useState([]);
  const [trackers, setTrackers] = useState([]);
  const [geofences, setGeofences] = useState([]);

  // --------- Helpers para fetch -----------------------------------------

  const fetchTrackers = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;

    const { data, error } = await supabase
      .from("personal")
      .select("id, nombre, email, activo_bool, vigente, is_deleted")
      .eq("org_id", currentOrgId)
      .order("nombre", { ascending: true });

    if (error) {
      console.error("[TrackerDashboard] error fetching trackers", error);
      setErrorMsg("Error al cargar trackers (personal)");
      return;
    }

    // Solo trackers activos / vigentes / no borrados
    const activos =
      data?.filter(
        (p) =>
          (p.activo_bool ?? true) === true &&
          (p.vigente ?? true) === true &&
          (p.is_deleted ?? false) === false
      ) ?? [];

    setTrackers(activos);
  }, []);

  const fetchGeofences = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;

    const { data, error } = await supabase
      .from("geocercas")
      .select("id, nombre, deleted_at")
      .eq("org_id", currentOrgId)
      .is("deleted_at", null)
      .order("nombre", { ascending: true });

    if (error) {
      console.error("[TrackerDashboard] error fetching geocercas", error);
      setErrorMsg("Error al cargar geocercas");
      return;
    }

    setGeofences(data ?? []);
  }, []);

  const fetchPositions = useCallback(
    async (currentOrgId, options = { showSpinner: true }) => {
      if (!currentOrgId) return;
      const { showSpinner } = options;

      try {
        if (showSpinner) setLoading(true);
        setErrorMsg("");

        const windowConfig =
          TIME_WINDOWS.find((w) => w.id === timeWindowId) ??
          TIME_WINDOWS[1]; // 6h default
        const fromMs = Date.now() - windowConfig.ms;
        const fromIso = new Date(fromMs).toISOString();

        let query = supabase
          .from("v_positions_with_activity")
          .select(
            "id, org_id, tenant_id, user_id, lat, lng, accuracy, recorded_at, meta"
          )
          .eq("org_id", currentOrgId)
          .gte("recorded_at", fromIso)
          .order("recorded_at", { ascending: false })
          .limit(1000);

        // Filtro por tracker (por user_id)
        if (selectedTrackerId !== "all") {
          query = query.eq("user_id", selectedTrackerId);
        }

        const { data, error } = await query;

        if (error) {
          console.error("[TrackerDashboard] error fetching positions", error);
          setErrorMsg("Error al cargar posiciones");
          return;
        }

        setPositions(data ?? []);
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [selectedTrackerId, timeWindowId]
  );

  const fetchAllSummary = useCallback(
    async (currentOrgId) => {
      if (!currentOrgId) return;
      setLoadingSummary(true);
      try {
        await Promise.all([
          fetchTrackers(currentOrgId),
          fetchGeofences(currentOrgId),
          fetchPositions(currentOrgId, { showSpinner: false }),
        ]);
      } finally {
        setLoadingSummary(false);
      }
    },
    [fetchGeofences, fetchTrackers, fetchPositions]
  );

  // --------- Efectos: carga inicial + auto-refresh -----------------------

  useEffect(() => {
    if (!orgId) return;
    fetchAllSummary(orgId);
  }, [orgId, fetchAllSummary]);

  // Auto-refresh cada 30 segundos solo de posiciones
  useEffect(() => {
    if (!orgId) return;
    const id = setInterval(() => {
      fetchPositions(orgId, { showSpinner: false });
    }, 30_000);
    return () => clearInterval(id);
  }, [orgId, fetchPositions]);

  // Re-cargar posiciones cuando cambia ventana o filtro de tracker
  useEffect(() => {
    if (!orgId) return;
    fetchPositions(orgId);
  }, [orgId, timeWindowId, selectedTrackerId, fetchPositions]);

  // --------- Derived data para filtros y resumen ------------------------

  const filteredPositions = useMemo(() => {
    let pts = positions ?? [];

    // Filtro por geocerca usando meta.geocercas_match (si existe)
    if (selectedGeofenceId !== "all") {
      pts = pts.filter((p) => {
        const matches = p?.meta?.geocercas_match;
        if (!Array.isArray(matches)) return false;
        return matches.includes(selectedGeofenceId);
      });
    }

    return pts;
  }, [positions, selectedGeofenceId]);

  const pointsByTracker = useMemo(() => {
    const map = new Map();
    for (const p of filteredPositions) {
      if (!p) continue;
      const key = p.user_id || "desconocido";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return map;
  }, [filteredPositions]);

  const totalTrackers = trackers.length;
  const totalGeofences = geofences.length;
  const totalPoints = filteredPositions.length;
  const lastPoint = filteredPositions[0] ?? null;
  const lastPointTime = lastPoint?.recorded_at ?? null;

  // Centro del mapa: Quito por defecto; si hay puntos, usamos el último
  const mapCenter = useMemo(() => {
    if (lastPoint) {
      return [lastPoint.lat || -0.19, lastPoint.lng || -78.48];
    }
    return [-0.19, -78.48];
  }, [lastPoint]);

  // --------- Render -----------------------------------------------------

  if (!orgId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">
          Dashboard de Tracking
        </h1>
        <p className="text-red-600">
          Error de configuración: no se pudo resolver la
          organización activa (<code>orgId</code>).
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Dashboard de Tracking en tiempo real
          </h1>
          <p className="text-sm text-slate-500">
            Los puntos se actualizan automáticamente. La frecuencia de
            envío la define el administrador y los trackers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Ventana de tiempo */}
          <label className="text-sm flex items-center gap-2">
            <span className="font-medium">Ventana:</span>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={timeWindowId}
              onChange={(e) => setTimeWindowId(e.target.value)}
            >
              {TIME_WINDOWS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>

          {/* Tracker */}
          <label className="text-sm flex items-center gap-2">
            <span className="font-medium">Tracker:</span>
            <select
              className="border rounded px-2 py-1 text-sm min-w-[150px]"
              value={selectedTrackerId}
              onChange={(e) => setSelectedTrackerId(e.target.value)}
            >
              <option value="all">Todos los trackers</option>
              {trackers.map((t) => (
                <option key={t.id} value={t.owner_id || t.id}>
                  {t.nombre || t.email || t.id}
                </option>
              ))}
            </select>
          </label>

          {/* Geocerca */}
          <label className="text-sm flex items-center gap-2">
            <span className="font-medium">Geocerca:</span>
            <select
              className="border rounded px-2 py-1 text-sm min-w-[150px]"
              value={selectedGeofenceId}
              onChange={(e) => setSelectedGeofenceId(e.target.value)}
            >
              <option value="all">Todas las geocercas</option>
              {geofences.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre || g.id}
                </option>
              ))}
            </select>
          </label>

          {/* Botón refrescar */}
          <button
            type="button"
            onClick={() => fetchPositions(orgId)}
            className="border rounded px-3 py-1 text-sm bg-white hover:bg-slate-50"
            disabled={loading}
          >
            {loading ? "Actualizando..." : "Actualizar ahora"}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-4">
        {/* MAPA */}
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="border-b px-3 py-2 flex items-center justify-between">
            <span className="text-sm font-medium">
              Mapa de posiciones
            </span>
            <span className="text-xs text-slate-500">
              Puntos en ventana seleccionada:{" "}
              <span className="font-semibold">{totalPoints}</span>
            </span>
          </div>

          <div className="h-[480px]">
            <MapContainer
              center={mapCenter}
              zoom={12}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Polilíneas y puntos por tracker */}
              {Array.from(pointsByTracker.entries()).map(
                ([trackerId, pts], idx) => {
                  if (!pts.length) return null;
                  const color =
                    TRACKER_COLORS[idx % TRACKER_COLORS.length];
                  const positionsLatLng = pts
                    .map((p) =>
                      typeof p.lat === "number" &&
                      typeof p.lng === "number"
                        ? [p.lat, p.lng]
                        : null
                    )
                    .filter(Boolean);

                  const latest = pts[0];

                  return (
                    <React.Fragment key={trackerId}>
                      {positionsLatLng.length > 1 && (
                        <Polyline
                          positions={positionsLatLng}
                          pathOptions={{ color, weight: 3 }}
                        />
                      )}

                      {latest &&
                        typeof latest.lat === "number" &&
                        typeof latest.lng === "number" && (
                          <CircleMarker
                            center={[latest.lat, latest.lng]}
                            radius={6}
                            pathOptions={{
                              color,
                              fillColor: color,
                              fillOpacity: 0.9,
                            }}
                          >
                            <Tooltip direction="top">
                              <div className="text-xs">
                                <div>
                                  <strong>Tracker:</strong> {trackerId}
                                </div>
                                <div>
                                  <strong>Hora:</strong>{" "}
                                  {formatTime(latest.recorded_at)}
                                </div>
                                <div>
                                  <strong>Lat:</strong>{" "}
                                  {latest.lat.toFixed(6)}
                                </div>
                                <div>
                                  <strong>Lng:</strong>{" "}
                                  {latest.lng.toFixed(6)}
                                </div>
                              </div>
                            </Tooltip>
                          </CircleMarker>
                        )}
                    </React.Fragment>
                  );
                }
              )}

              {/* Mensaje si no hay puntos */}
              {!totalPoints && (
                <div className="leaflet-bottom leaflet-left mb-2 ml-2">
                  <div className="bg-white/90 text-xs px-2 py-1 rounded shadow">
                    No hay posiciones para los filtros actuales.
                  </div>
                </div>
              )}
            </MapContainer>
          </div>
        </div>

        {/* RESUMEN / LEYENDA */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-white px-4 py-3">
            <h2 className="text-lg font-semibold mb-3">Resumen</h2>

            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="font-medium">Geocercas activas:</dt>
                <dd>{totalGeofences}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium">Trackers (perfiles):</dt>
                <dd>{totalTrackers}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium">
                  Puntos en mapa (filtro actual):
                </dt>
                <dd>{totalPoints}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium">
                  Último punto registrado:
                </dt>
                <dd>
                  {lastPointTime
                    ? formatDateTime(lastPointTime)
                    : "-"}
                </dd>
              </div>
            </dl>

            {loadingSummary && (
              <p className="mt-3 text-xs text-slate-500">
                Actualizando datos de resumen…
              </p>
            )}
          </div>

          <div className="rounded-lg border bg-white px-4 py-3 text-sm">
            <h3 className="font-semibold mb-2">
              Leyenda de trackers
            </h3>
            {trackers.length === 0 && (
              <p className="text-slate-500 text-sm">
                No hay perfiles de tracker configurados en esta
                organización.
              </p>
            )}

            {trackers.length > 0 && (
              <ul className="space-y-1">
                {trackers.map((t, idx) => {
                  const color =
                    TRACKER_COLORS[idx % TRACKER_COLORS.length];
                  const label = t.nombre || t.email || t.id;
                  return (
                    <li key={t.id} className="flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span>{label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-lg border bg-white px-4 py-3 text-xs text-slate-500 space-y-1">
            <div>
              <strong>Tip:</strong> Si ves que el tracker está
              enviando (Pantalla de tracker activa) pero aquí no
              aparecen puntos:
            </div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Revisa la ventana de tiempo (1h / 6h / 24h).</li>
              <li>
                Verifica que el filtro de tracker no esté en un
                perfil distinto.
              </li>
              <li>
                Si filtraste por geocerca, prueba con “Todas las
                geocercas”.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
