// src/pages/TrackerDashboard.jsx
// Dashboard de tracking en tiempo real
//
// - Obtiene la organización activa desde AuthContext (useAuth).
// - Trackers: tabla personal (org_id)  -> usamos personal.user_id como "auth user id" del tracker
// - Geocercas: vista v_geocercas_tracker_ui (RLS, select "*", filtrada por org_id)
// - Posiciones: tabla tracker_positions (NO tiene org_id) → scoping universal por user_ids (personal.user_id) de la org
//
// FIX CLAVE:
// - Antes se resolvía mal el ID (owner_id/id/etc.) y el .in("user_id", ...) filtraba todo.
// - Ahora SOLO usamos personal.user_id (que debe coincidir con tracker_positions.user_id).

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Circle,
  Tooltip,
  GeoJSON,
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

function safeJson(input) {
  if (!input) return null;
  if (typeof input === "object") return input;
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }
  return null;
}

// ✅ Resolver correcto: tracker_positions.user_id = personal.user_id (auth.users.id)
function resolveTrackerAuthId(row) {
  return row?.user_id ? String(row.user_id) : null;
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
  // IMPORTANTE: usamos select("*") para no romper por columnas faltantes.
  // y luego filtramos en memoria por flags.
  const fetchTrackers = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;

    const { data, error } = await supabase
      .from("personal")
      .select("*")
      .eq("org_id", currentOrgId)
      .order("nombre", { ascending: true });

    if (error) {
      console.error("[TrackerDashboard] error fetching trackers", error);
      setErrorMsg("Error al cargar trackers (personal)");
      setTrackers([]);
      return;
    }

    const arr = Array.isArray(data) ? data : [];

    const activos = arr.filter((p) => {
      const activo = (p?.activo_bool ?? true) === true;
      const vigente = (p?.vigente ?? true) === true;
      const notDeleted = (p?.is_deleted ?? false) === false;
      // ✅ debe tener user_id para que pueda aparecer en tracker_positions
      const hasUserId = !!resolveTrackerAuthId(p);
      return activo && vigente && notDeleted && hasUserId;
    });

    setTrackers(activos);
  }, []);

  // 🔹 GEOCERCAS: vista v_geocercas_tracker_ui (RLS), filtrada por org_id
  const fetchGeofences = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;

    const { data, error } = await supabase
      .from("v_geocercas_tracker_ui")
      .select("*")
      .eq("org_id", currentOrgId);

    if (error) {
      console.error("[TrackerDashboard] error fetching geocercas", error);
      setErrorMsg(
        "No se pudieron cargar las geocercas desde v_geocercas_tracker_ui."
      );
      setGeofences([]);
      return;
    }

    const arr = Array.isArray(data) ? data : [];

    // Ordenar en memoria por name / nombre / id
    arr.sort((a, b) => {
      const labelA = (a.name || a.nombre || a.id || "").toString().toLowerCase();
      const labelB = (b.name || b.nombre || b.id || "").toString().toLowerCase();
      return labelA.localeCompare(labelB);
    });

    setGeofences(arr);
  }, []);

  // 🔹 POSICIONES: tracker_positions (scoping universal por personal.user_id de la org)
  const fetchPositions = useCallback(
    async (currentOrgId, options = { showSpinner: true }) => {
      if (!currentOrgId) return;

      const { showSpinner } = options;

      try {
        if (showSpinner) setLoading(true);
        setErrorMsg("");

        const windowConfig =
          TIME_WINDOWS.find((w) => w.id === timeWindowId) ?? TIME_WINDOWS[1]; // 6h default
        const fromMs = Date.now() - windowConfig.ms;
        const fromIso = new Date(fromMs).toISOString();

        // ✅ scoping universal: solo user_ids que pertenecen a trackers de esta org
        const allowedTrackerIds = (trackers || [])
          .map(resolveTrackerAuthId)
          .filter(Boolean);

        // DEBUG opcional:
        // console.log("[TrackerDashboard] allowedTrackerIds", allowedTrackerIds);

        if (allowedTrackerIds.length === 0) {
          setPositions([]);
          return;
        }

        // filtro tracker
        const targetIds =
          selectedTrackerId !== "all"
            ? [String(selectedTrackerId)]
            : allowedTrackerIds;

        let query = supabase
          .from("tracker_positions")
          .select("id, user_id, geocerca_id, latitude, longitude, accuracy, speed, created_at")
          .gte("created_at", fromIso)
          .in("user_id", targetIds)
          .order("created_at", { ascending: false })
          .limit(1000);

        const { data, error } = await query;

        if (error) {
          console.error(
            "[TrackerDashboard] error fetching positions (tracker_positions)",
            error
          );
          setErrorMsg("Error al cargar posiciones");
          return;
        }

        // Normalizamos a la estructura esperada por el render (lat/lng/recorded_at/meta)
        const normalized = (data ?? []).map((r) => ({
          id: r.id,
          user_id: r.user_id,
          geocerca_id: r.geocerca_id,
          lat: r.latitude,
          lng: r.longitude,
          accuracy: r.accuracy,
          speed: r.speed,
          recorded_at: r.created_at,
          meta: null,
        }));

        setPositions(normalized);
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [selectedTrackerId, timeWindowId, trackers]
  );

  const fetchAllSummary = useCallback(
    async (currentOrgId) => {
      if (!currentOrgId) return;
      setLoadingSummary(true);
      try {
        await Promise.all([
          fetchTrackers(currentOrgId),
          fetchGeofences(currentOrgId),
        ]);
      } finally {
        setLoadingSummary(false);
      }
    },
    [fetchGeofences, fetchTrackers]
  );

  // -----------------------------------------------------------------------
  // EFECTOS
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!orgId) return;
    fetchAllSummary(orgId);
  }, [orgId, fetchAllSummary]);

  // Cuando ya cargaron trackers, trae posiciones
  useEffect(() => {
    if (!orgId) return;
    if (!trackers || trackers.length === 0) {
      setPositions([]);
      return;
    }
    fetchPositions(orgId, { showSpinner: true });
  }, [orgId, trackers, timeWindowId, selectedTrackerId, fetchPositions]);

  // Polling
  useEffect(() => {
    if (!orgId) return;
    if (!trackers || trackers.length === 0) return;
    const id = setInterval(() => {
      fetchPositions(orgId, { showSpinner: false });
    }, 30_000);
    return () => clearInterval(id);
  }, [orgId, trackers, fetchPositions]);

  // -----------------------------------------------------------------------
  // DERIVED DATA
  // -----------------------------------------------------------------------

  const filteredPositions = useMemo(() => {
    let pts = positions ?? [];

    // ✅ filtro por geocerca_id (universal; no depende de meta)
    if (selectedGeofenceId !== "all") {
      pts = pts.filter(
        (p) => String(p?.geocerca_id || "") === String(selectedGeofenceId)
      );
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
    if (
      lastPoint &&
      typeof lastPoint.lat === "number" &&
      typeof lastPoint.lng === "number"
    ) {
      return [lastPoint.lat, lastPoint.lng];
    }
    return [-0.19, -78.48]; // Quito
  }, [lastPoint]);

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------

  if (!orgId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Dashboard de Tracking</h1>
        <p className="text-red-600">
          Error de configuración: no se pudo resolver la organización activa (
          <code>orgId</code>).
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-semibold leading-tight">
            Dashboard de Tracking en tiempo real
          </h1>
          <p className="text-xs md:text-sm text-slate-500 leading-snug">
            Los puntos se actualizan automáticamente. La frecuencia de envío la
            define el administrador y los trackers.
          </p>
          <p className="text-[11px] text-slate-500">
            Org activa: <span className="font-mono">{String(orgId)}</span>
          </p>
        </div>

        {/* FILTROS */}
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:gap-3">
          {/* Ventana de tiempo */}
          <label className="text-xs md:text-sm flex items-center gap-2">
            <span className="font-medium">Ventana:</span>
            <select
              className="border rounded px-2 py-1 text-xs md:text-sm w-full md:w-auto"
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
          <label className="text-xs md:text-sm flex items-center gap-2">
            <span className="font-medium">Tracker:</span>
            <select
              className="border rounded px-2 py-1 text-xs md:text-sm w-full md:min-w-[150px]"
              value={selectedTrackerId}
              onChange={(e) => setSelectedTrackerId(e.target.value)}
            >
              <option value="all">Todos los trackers</option>
              {trackers.map((t) => {
                const tid = resolveTrackerAuthId(t);
                return (
                  <option key={t.id} value={String(tid)}>
                    {t.nombre || t.email || String(tid)}
                  </option>
                );
              })}
            </select>
          </label>

          {/* Geocerca */}
          <label className="text-xs md:text-sm flex items-center gap-2">
            <span className="font-medium">Geocerca:</span>
            <select
              className="border rounded px-2 py-1 text-xs md:text-sm w-full md:min-w-[150px]"
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
            className="col-span-2 md:col-span-1 border rounded px-3 py-2 md:py-1 text-xs md:text-sm bg-white hover:bg-slate-50"
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

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-3 md:gap-4">
        {/* MAPA */}
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="border-b px-2 py-2 md:px-3 md:py-2 flex items-center justify-between">
            <span className="text-xs md:text-sm font-medium">
              Mapa de posiciones
            </span>
            <span className="text-[11px] md:text-xs text-slate-500">
              Puntos en ventana seleccionada:{" "}
              <span className="font-semibold">{totalPoints}</span>
            </span>
          </div>

          <div className="h-[65vh] md:h-[480px]">
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

              {/* GEOCERCAS */}
              {geofences.map((g) => {
                const label = g.name || g.nombre || g.id;

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

                const radius =
                  typeof g.radius_m === "number"
                    ? g.radius_m
                    : typeof g.radius === "number"
                    ? g.radius
                    : 0;

                const shapeRaw =
                  g.geojson || g.geometry || g.geom || g.polygon || null;
                const shape = safeJson(shapeRaw) || shapeRaw || null;

                const layers = [];

                if (shape) {
                  layers.push(
                    <GeoJSON
                      key={`geo-shape-${g.id}`}
                      data={shape}
                      style={() => ({
                        color: "#22c55e",
                        weight: 2,
                        fillOpacity: 0.15,
                      })}
                    >
                      <Tooltip sticky>{label}</Tooltip>
                    </GeoJSON>
                  );
                }

                // Si hay centro definido, dibujamos círculo o marcador
                if (lat != null && lng != null) {
                  if (radius) {
                    layers.push(
                      <Circle
                        key={`geo-circle-${g.id}`}
                        center={[lat, lng]}
                        radius={radius}
                        pathOptions={{
                          color: "#22c55e",
                          fillColor: "#22c55e",
                          fillOpacity: 0.08,
                        }}
                      >
                        <Tooltip>{label}</Tooltip>
                      </Circle>
                    );
                  } else {
                    layers.push(
                      <CircleMarker
                        key={`geo-center-${g.id}`}
                        center={[lat, lng]}
                        radius={6}
                        pathOptions={{
                          color: "#22c55e",
                          fillColor: "#22c55e",
                          fillOpacity: 0.9,
                        }}
                      >
                        <Tooltip>{label}</Tooltip>
                      </CircleMarker>
                    );
                  }
                }

                return layers;
              })}

              {/* POSICIONES / TRACKS */}
              {Array.from(pointsByTracker.entries()).map(
                ([trackerId, pts], idx) => {
                  if (!pts.length) return null;
                  const color = TRACKER_COLORS[idx % TRACKER_COLORS.length];

                  const positionsLatLng = pts
                    .map((p) =>
                      typeof p.lat === "number" && typeof p.lng === "number"
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
                                  {Number(latest.lat).toFixed(6)}
                                </div>
                                <div>
                                  <strong>Lng:</strong>{" "}
                                  {Number(latest.lng).toFixed(6)}
                                </div>
                                <div>
                                  <strong>Geocerca:</strong>{" "}
                                  {latest.geocerca_id
                                    ? String(latest.geocerca_id)
                                    : "— (en espera)"}
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
        <div className="space-y-3 md:space-y-4">
          <div className="rounded-lg border bg-white px-4 py-3">
            <h2 className="text-base md:text-lg font-semibold mb-2 md:mb-3">
              Resumen
            </h2>

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
                <dt className="font-medium">Puntos en mapa (filtro actual):</dt>
                <dd>{totalPoints}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium">Último punto registrado:</dt>
                <dd>{lastPointTime ? formatDateTime(lastPointTime) : "-"}</dd>
              </div>
            </dl>

            {loadingSummary && (
              <p className="mt-2 md:mt-3 text-xs text-slate-500">
                Actualizando datos de resumen…
              </p>
            )}
          </div>

          <div className="rounded-lg border bg-white px-4 py-3 text-sm">
            <h3 className="font-semibold mb-2">Leyenda de trackers</h3>
            {trackers.length === 0 ? (
              <p className="text-slate-500 text-sm">
                No hay perfiles de tracker configurados en esta organización (o
                faltan <code>user_id</code>).
              </p>
            ) : (
              <ul className="space-y-1">
                {trackers.map((t, idx) => {
                  const color = TRACKER_COLORS[idx % TRACKER_COLORS.length];
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
              <strong>Tip:</strong> Si el tracker está enviando pero aquí no
              aparecen puntos:
            </div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Revisa la ventana de tiempo (1h / 6h / 24h).</li>
              <li>Prueba “Todos los trackers”.</li>
              <li>Si filtraste por geocerca, prueba con “Todas las geocercas”.</li>
              <li>
                Verifica que en <code>personal</code> cada tracker tenga{" "}
                <code>user_id</code> correcto (auth.users.id).
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
