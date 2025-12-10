// src/pages/TrackerDashboard.jsx
// Dashboard de tracking en tiempo real
//
// - Obtiene la organización activa desde AuthContext (useAuth).
// - Trackers: tabla personal (org_id)
// - Geocercas: vista v_geocercas_resumen_ui (RLS, select "*")
// - Posiciones: vista v_positions_with_activity (RLS; SIN filtrar por org_id aquí)

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
  Circle,
  Tooltip,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

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
  // Organización activa desde AuthContext
  const { currentOrg } = useAuth();

  // currentOrg puede ser string o un objeto con id / org_id
  const orgId =
    typeof currentOrg === "string"
      ? currentOrg
      : currentOrg?.id || currentOrg?.org_id || null;

  const [loading, setLoading] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [timeWindowId, setTimeWindowId] = useState("6h");
  const [selectedTrackerId, setSelectedTrackerId] = useState("all");
  const [selectedGeofenceId, setSelectedGeofenceId] = useState("all");

  const [positions, setPositions] = useState([]);
  const [trackers, setTrackers] = useState([]);
  const [geofences, setGeofences] = useState([]);

  // -----------------------------------------------------------------------
  // FETCH HELPERS
  // -----------------------------------------------------------------------

  // 🔹 TRACKERS: tabla personal, filtrada por org_id
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

    const activos =
      data?.filter(
        (p) =>
          (p.activo_bool ?? true) === true &&
          (p.vigente ?? true) === true &&
          (p.is_deleted ?? false) === false
      ) ?? [];

    setTrackers(activos);
  }, []);

  // 🔹 GEOCERCAS: vista v_geocercas_resumen_ui
  //   - select("*") para no romper por columnas
  //   - ordenamos por name / nombre / id
  const fetchGeofences = useCallback(async () => {
    const { data, error } = await supabase
      .from("v_geocercas_resumen_ui")
      .select("*");

    if (error) {
      console.error("[TrackerDashboard] error fetching geocercas", error);
      setErrorMsg(
        "No se pudieron cargar las geocercas desde v_geocercas_resumen_ui."
      );
      setGeofences([]);
      return;
    }

    const arr = Array.isArray(data) ? data : [];

    // Ordenar en memoria por name / nombre / id
    arr.sort((a, b) => {
      const labelA = (a.name || a.nombre || a.id || "")
        .toString()
        .toLowerCase();
      const labelB = (b.name || b.nombre || b.id || "")
        .toString()
        .toLowerCase();
      return labelA.localeCompare(labelB);
    });

    setGeofences(arr);
  }, []);

  // 🔹 POSICIONES: vista v_positions_with_activity (sin filtro org_id aquí;
  //   dejamos que RLS haga su trabajo)
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
          .gte("recorded_at", fromIso)
          .order("recorded_at", { ascending: false })
          .limit(1000);

        // Filtramos por tracker si está seleccionado
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
          fetchGeofences(),
          fetchPositions(currentOrgId, { showSpinner: false }),
        ]);
      } finally {
        setLoadingSummary(false);
      }
    },
    [fetchGeofences, fetchTrackers, fetchPositions]
  );

  // -----------------------------------------------------------------------
  // EFECTOS
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!orgId) return;
    fetchAllSummary(orgId);
  }, [orgId, fetchAllSummary]);

  useEffect(() => {
    if (!orgId) return;
    const id = setInterval(() => {
      fetchPositions(orgId, { showSpinner: false });
    }, 30_000);
    return () => clearInterval(id);
  }, [orgId, fetchPositions]);

  useEffect(() => {
    if (!orgId) return;
    fetchPositions(orgId);
  }, [orgId, timeWindowId, selectedTrackerId, fetchPositions]);

  // -----------------------------------------------------------------------
  // DERIVED DATA
  // -----------------------------------------------------------------------

  const filteredPositions = useMemo(() => {
    let pts = positions ?? [];

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

  const mapCenter = useMemo(() => {
    if (lastPoint) {
      return [lastPoint.lat || -0.19, lastPoint.lng || -78.48];
    }
    return [-0.19, -78.48];
  }, [lastPoint]);

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------

  if (!orgId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">
          Dashboard de Tracking
        </h1>
        <p className="text-red-600">
          Error de configuración: no se pudo resolver la organización
          activa (<code>orgId</code>).
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
                  {g.name || g.nombre || g.id}
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
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded text-sm">
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

              {/* GEOCERCAS COMO CÍRCULOS */}
              {geofences.map((g) => {
                const lat =
                  typeof g.lat === "number"
                    ? g.lat
                    : typeof g.center_lat === "number"
                    ? g.center_lat
                    : null;
                const lng =
                  typeof g.lng === "number"
                    ? g.lng
                    : typeof g.center_lng === "number"
                    ? g.center_lng
                    : null;

                if (!lat || !lng) return null;

                const radius =
                  typeof g.radius_m === "number"
                    ? g.radius_m
                    : typeof g.radius === "number"
                    ? g.radius
                    : 0;

                if (!radius) {
                  // Si no hay radio, al menos marcamos el centro
                  return (
                    <CircleMarker
                      key={`geo-${g.id}`}
                      center={[lat, lng]}
                      radius={6}
                      pathOptions={{
                        color: "#22c55e",
                        fillColor: "#22c55e",
                        fillOpacity: 0.9,
                      }}
                    >
                      <Tooltip>{g.name || g.nombre || g.id}</Tooltip>
                    </CircleMarker>
                  );
                }

                return (
                  <Circle
                    key={`geo-${g.id}`}
                    center={[lat, lng]}
                    radius={radius}
                    pathOptions={{
                      color: "#22c55e",
                      fillColor: "#22c55e",
                      fillOpacity: 0.15,
                    }}
                  >
                    <Tooltip>{g.name || g.nombre || g.id}</Tooltip>
                  </Circle>
                );
              })}

              {/* POSICIONES / TRACKS */}
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
