// src/pages/TrackerDashboard.jsx
// Dashboard de tracking en tiempo real
//
// - Obtiene la organización activa desde AuthContext (useAuth).
// - Trackers: tabla personal (scoped por org_id)
// - Geocercas: vista v_geocercas_tracker_ui (scoped por org_id)
// - Posiciones: tabla tracker_positions (NO tiene org_id)
//   => scoping universal por user_id (auth.users.id) de trackers pertenecientes a la org.
//
// FIX UNIVERSAL (render):
// - Supabase/Postgres puede devolver latitude/longitude como string (numeric)
// - Normalizamos a Number y validamos finitos para que Leaflet renderice.
// - FitBounds automático cuando llegan puntos.

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Circle,
  Tooltip,
  GeoJSON,
  useMap,
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

// Normaliza numeric/string -> number y valida
function toNum(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isValidLatLng(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// ✅ Resolver universal del auth uid del tracker
function resolveTrackerAuthId(row) {
  return row?.user_id || row?.owner_id || null;
}

// Componente para hacer fitBounds cuando hay puntos válidos
function FitToPoints({ points, enabled }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;
    if (!map) return;

    const latLngs =
      (points || [])
        .map((p) => {
          const lat = toNum(p?.lat);
          const lng = toNum(p?.lng);
          return isValidLatLng(lat, lng) ? [lat, lng] : null;
        })
        .filter(Boolean) ?? [];

    if (latLngs.length === 0) return;

    // Si es 1 punto, solo pan + zoom razonable
    if (latLngs.length === 1) {
      map.setView(latLngs[0], Math.max(map.getZoom() || 12, 15), { animate: true });
      return;
    }

    map.fitBounds(latLngs, { padding: [24, 24] });
  }, [map, points, enabled]);

  return null;
}

export default function TrackerDashboard() {
  const { currentOrg } = useAuth();

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

    setErrorMsg("");

    const { data, error } = await supabase
      .from("personal")
      .select("*")
      .eq("org_id", currentOrgId)
      .order("nombre", { ascending: true });

    if (error) {
      console.error("[TrackerDashboard] error fetching trackers (personal)", error);
      setErrorMsg("Error al cargar trackers (personal).");
      setTrackers([]);
      return;
    }

    const arr = Array.isArray(data) ? data : [];

    const activos =
      arr.filter(
        (p) =>
          (p.activo_bool ?? true) === true &&
          (p.vigente ?? true) === true &&
          (p.is_deleted ?? false) === false
      ) ?? [];

    const conUid = activos.filter((p) => !!resolveTrackerAuthId(p));

    setTrackers(conUid);
  }, []);

  // 🔹 GEOCERCAS: vista v_geocercas_tracker_ui, filtrada por org_id
  const fetchGeofences = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;

    setErrorMsg("");

    const { data, error } = await supabase
      .from("v_geocercas_tracker_ui")
      .select("*")
      .eq("org_id", currentOrgId);

    if (error) {
      console.error("[TrackerDashboard] error fetching geocercas", error);
      setErrorMsg("No se pudieron cargar las geocercas (v_geocercas_tracker_ui).");
      setGeofences([]);
      return;
    }

    const arr = Array.isArray(data) ? data : [];

    arr.sort((a, b) => {
      const labelA = (a.name || a.nombre || a.id || "").toString().toLowerCase();
      const labelB = (b.name || b.nombre || b.id || "").toString().toLowerCase();
      return labelA.localeCompare(labelB);
    });

    setGeofences(arr);
  }, []);

  // 🔹 POSICIONES: tracker_positions (scoping universal por auth user_id de trackers de la org)
  const fetchPositions = useCallback(
    async (currentOrgId, options = { showSpinner: true }) => {
      if (!currentOrgId) return;

      if (!trackers || trackers.length === 0) {
        console.warn("[TrackerDashboard] fetchPositions skipped: trackers not loaded yet");
        return;
      }

      const { showSpinner } = options;

      try {
        if (showSpinner) setLoading(true);
        setErrorMsg("");

        const windowConfig =
          TIME_WINDOWS.find((w) => w.id === timeWindowId) ?? TIME_WINDOWS[1];
        const fromIso = new Date(Date.now() - windowConfig.ms).toISOString();

        const allowedTrackerIds = (trackers || [])
          .map(resolveTrackerAuthId)
          .filter(Boolean)
          .map((x) => String(x));

        if (allowedTrackerIds.length === 0) {
          setPositions([]);
          return;
        }

        let targetIds = allowedTrackerIds;
        if (selectedTrackerId !== "all") {
          const wanted = String(selectedTrackerId);
          if (!allowedTrackerIds.includes(wanted)) {
            setSelectedTrackerId("all");
            targetIds = allowedTrackerIds;
          } else {
            targetIds = [wanted];
          }
        }

        const { data, error } = await supabase
          .from("tracker_positions")
          .select("id, user_id, geocerca_id, latitude, longitude, accuracy, speed, created_at")
          .gte("created_at", fromIso)
          .in("user_id", targetIds)
          .order("created_at", { ascending: false })
          .limit(1000);

        if (error) {
          console.error("[TrackerDashboard] error fetching positions (tracker_positions)", error);
          setErrorMsg("Error al cargar posiciones.");
          return;
        }

        const normalized = (data ?? [])
          .map((r) => {
            const lat = toNum(r.latitude);
            const lng = toNum(r.longitude);
            return {
              id: r.id,
              user_id: r.user_id,
              geocerca_id: r.geocerca_id,
              lat,
              lng,
              accuracy: r.accuracy,
              speed: r.speed,
              recorded_at: r.created_at,
              meta: null,
              _valid: isValidLatLng(lat, lng),
            };
          })
          .filter((p) => p._valid); // <- si prefieres ver inválidos, quita este filter

        setPositions(normalized);
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [trackers, selectedTrackerId, timeWindowId]
  );

  // -----------------------------------------------------------------------
  // EFECTOS
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!orgId) return;
    setLoadingSummary(true);
    (async () => {
      try {
        await Promise.all([fetchTrackers(orgId), fetchGeofences(orgId)]);
      } finally {
        setLoadingSummary(false);
      }
    })();
  }, [orgId, fetchTrackers, fetchGeofences]);

  useEffect(() => {
    if (!orgId) return;
    if (!trackers || trackers.length === 0) return;
    fetchPositions(orgId, { showSpinner: true });
  }, [orgId, trackers, timeWindowId, selectedTrackerId, fetchPositions]);

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

    if (selectedGeofenceId !== "all") {
      pts = pts.filter((p) => String(p?.geocerca_id || "") === String(selectedGeofenceId));
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
    const lat = toNum(lastPoint?.lat);
    const lng = toNum(lastPoint?.lng);
    if (isValidLatLng(lat, lng)) return [lat, lng];
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
          Error de configuración: no se pudo resolver la organización activa (<code>orgId</code>).
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
            Los puntos se actualizan automáticamente. La frecuencia de envío la define el administrador y los trackers.
          </p>
          <p className="text-[11px] text-slate-500">
            Org activa: <span className="font-mono">{String(orgId)}</span>{" "}
            <span className="ml-2">
              Trackers con UID: <b>{totalTrackers}</b>
            </span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:gap-3">
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

          <label className="text-xs md:text-sm flex items-center gap-2">
            <span className="font-medium">Tracker:</span>
            <select
              className="border rounded px-2 py-1 text-xs md:text-sm w-full md:min-w-[180px]"
              value={selectedTrackerId}
              onChange={(e) => setSelectedTrackerId(e.target.value)}
            >
              <option value="all">Todos los trackers</option>
              {trackers.map((t) => {
                const tid = resolveTrackerAuthId(t);
                const label = t.nombre || t.email || String(tid || t.id);
                return (
                  <option key={t.id} value={String(tid || "")}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="text-xs md:text-sm flex items-center gap-2">
            <span className="font-medium">Geocerca:</span>
            <select
              className="border rounded px-2 py-1 text-xs md:text-sm w-full md:min-w-[180px]"
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

          <button
            type="button"
            onClick={() => fetchPositions(orgId, { showSpinner: true })}
            className="col-span-2 md:col-span-1 border rounded px-3 py-2 md:py-1 text-xs md:text-sm bg-white hover:bg-slate-50"
            disabled={loading || !trackers?.length}
            title={!trackers?.length ? "Primero deben cargar los trackers" : ""}
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
            <span className="text-xs md:text-sm font-medium">Mapa de posiciones</span>
            <span className="text-[11px] md:text-xs text-slate-500">
              Puntos en ventana: <span className="font-semibold">{totalPoints}</span>
            </span>
          </div>

          <div className="h-[65vh] md:h-[480px]">
            <MapContainer center={mapCenter} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Fit automático a puntos */}
              <FitToPoints points={filteredPositions} enabled={totalPoints > 0} />

              {/* GEOCERCAS */}
              {geofences.map((g) => {
                const label = g.name || g.nombre || g.id;

                const lat = toNum(g.lat ?? g.center_lat);
                const lng = toNum(g.lng ?? g.center_lng);

                const radius = toNum(g.radius_m ?? g.radius) ?? 0;

                const shapeRaw = g.geojson || g.geometry || g.geom || g.polygon || null;
                const shape = safeJson(shapeRaw) || shapeRaw || null;

                const layers = [];

                if (shape) {
                  layers.push(
                    <GeoJSON
                      key={`geo-shape-${g.id}`}
                      data={shape}
                      style={() => ({ color: "#22c55e", weight: 2, fillOpacity: 0.15 })}
                    >
                      <Tooltip sticky>{label}</Tooltip>
                    </GeoJSON>
                  );
                }

                if (isValidLatLng(lat, lng)) {
                  if (radius) {
                    layers.push(
                      <Circle
                        key={`geo-circle-${g.id}`}
                        center={[lat, lng]}
                        radius={radius}
                        pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.08 }}
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
                        pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.9 }}
                      >
                        <Tooltip>{label}</Tooltip>
                      </CircleMarker>
                    );
                  }
                }

                return layers;
              })}

              {/* POSICIONES */}
              {Array.from(pointsByTracker.entries()).map(([trackerId, pts], idx) => {
                if (!pts.length) return null;
                const color = TRACKER_COLORS[idx % TRACKER_COLORS.length];

                // pts vienen en orden desc por created_at (latest primero)
                const latest = pts[0];

                // Para la polilínea queremos orden cronológico asc
                const chron = [...pts].reverse();
                const positionsLatLng = chron
                  .map((p) => {
                    const lat = toNum(p.lat);
                    const lng = toNum(p.lng);
                    return isValidLatLng(lat, lng) ? [lat, lng] : null;
                  })
                  .filter(Boolean);

                const latestLat = toNum(latest?.lat);
                const latestLng = toNum(latest?.lng);

                return (
                  <React.Fragment key={trackerId}>
                    {positionsLatLng.length > 1 && (
                      <Polyline positions={positionsLatLng} pathOptions={{ color, weight: 3 }} />
                    )}

                    {isValidLatLng(latestLat, latestLng) && (
                      <CircleMarker
                        center={[latestLat, latestLng]}
                        radius={7}
                        pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 2 }}
                      >
                        <Tooltip direction="top">
                          <div className="text-xs">
                            <div>
                              <strong>Tracker UID:</strong> {trackerId}
                            </div>
                            <div>
                              <strong>Hora:</strong> {formatTime(latest.recorded_at)}
                            </div>
                            <div>
                              <strong>Lat:</strong> {latestLat.toFixed(6)}
                            </div>
                            <div>
                              <strong>Lng:</strong> {latestLng.toFixed(6)}
                            </div>
                            <div>
                              <strong>Geocerca:</strong>{" "}
                              {latest.geocerca_id ? String(latest.geocerca_id) : "—"}
                            </div>
                          </div>
                        </Tooltip>
                      </CircleMarker>
                    )}
                  </React.Fragment>
                );
              })}

              {!totalPoints && (
                <div className="leaflet-bottom leaflet-left mb-2 ml-2">
                  <div className="bg-white/90 text-xs px-2 py-1 rounded shadow">
                    {trackers?.length
                      ? "No hay posiciones para los filtros/ventana actuales."
                      : "Cargando trackers… (luego se mostrarán posiciones)."}
                  </div>
                </div>
              )}
            </MapContainer>
          </div>
        </div>

        {/* RESUMEN */}
        <div className="space-y-3 md:space-y-4">
          <div className="rounded-lg border bg-white px-4 py-3">
            <h2 className="text-base md:text-lg font-semibold mb-2 md:mb-3">Resumen</h2>

            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="font-medium">Geocercas activas:</dt>
                <dd>{totalGeofences}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium">Trackers (con UID):</dt>
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
              <p className="mt-2 md:mt-3 text-xs text-slate-500">Actualizando datos…</p>
            )}
          </div>

          <div className="rounded-lg border bg-white px-4 py-3 text-sm">
            <h3 className="font-semibold mb-2">Leyenda de trackers</h3>
            {trackers.length === 0 ? (
              <p className="text-slate-500 text-sm">No hay trackers con UID en esta organización.</p>
            ) : (
              <ul className="space-y-1">
                {trackers.map((t, idx) => {
                  const color = TRACKER_COLORS[idx % TRACKER_COLORS.length];
                  const tid = resolveTrackerAuthId(t);
                  const label = t.nombre || t.email || String(tid || t.id);
                  return (
                    <li key={t.id} className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                      <span>{label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-lg border bg-white px-4 py-3 text-xs text-slate-500 space-y-1">
            <div>
              <strong>Tip:</strong> Si el tracker está enviando pero aquí no aparecen puntos:
            </div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Revisa la ventana de tiempo (1h / 6h / 24h).</li>
              <li>Prueba “Todos los trackers”.</li>
              <li>Si filtraste por geocerca, prueba con “Todas las geocercas”.</li>
              <li>Confirma que el tracker esté enviando con el mismo usuario (UID) que figura en Personal.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
