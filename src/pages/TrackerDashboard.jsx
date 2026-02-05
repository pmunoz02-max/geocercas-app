// src/pages/TrackerDashboard.jsx
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

import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

const TIME_WINDOWS = [
  { id: "1h", labelKey: "trackerDashboard.timeWindows.1h", fallback: "1 hora", ms: 1 * 60 * 60 * 1000 },
  { id: "6h", labelKey: "trackerDashboard.timeWindows.6h", fallback: "6 horas", ms: 6 * 60 * 60 * 1000 },
  { id: "12h", labelKey: "trackerDashboard.timeWindows.12h", fallback: "12 horas", ms: 12 * 60 * 60 * 1000 },
  { id: "24h", labelKey: "trackerDashboard.timeWindows.24h", fallback: "24 horas", ms: 24 * 60 * 60 * 1000 },
];

const TRACKER_COLORS = ["#2563eb", "#16a34a", "#f97316", "#dc2626", "#7c3aed", "#0d9488"];

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

function resolveTrackerAuthIdFromPersonal(row) {
  if (!row) return null;
  return (
    row.user_id ||
    row.owner_id ||
    row.auth_user_id ||
    row.auth_uid ||
    row.uid ||
    row.user_uuid ||
    null
  );
}

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

    if (latLngs.length === 1) {
      map.setView(latLngs[0], Math.max(map.getZoom() || 12, 15), { animate: true });
      return;
    }

    map.fitBounds(latLngs, { padding: [24, 24] });
  }, [map, points, enabled]);

  return null;
}

export default function TrackerDashboard() {
  const { t } = useTranslation();
  const tOr = useCallback((key, fallback) => t(key, { defaultValue: fallback }), [t]);

  const { currentOrg } = useAuth();
  const orgId =
    typeof currentOrg === "string" ? currentOrg : currentOrg?.id || currentOrg?.org_id || null;

  const [loading, setLoading] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [timeWindowId, setTimeWindowId] = useState("6h");
  const [selectedTrackerId, setSelectedTrackerId] = useState("all");
  const [selectedGeofenceId, setSelectedGeofenceId] = useState("all");

  const [positions, setPositions] = useState([]);

  const [membershipTrackers, setMembershipTrackers] = useState([]); // [{user_id}]
  const [personalRows, setPersonalRows] = useState([]);
  const [geofences, setGeofences] = useState([]);

  const fetchMembershipTrackers = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;

    setErrorMsg("");

    const { data, error } = await supabase
      .from("memberships")
      .select("user_id, role, org_id")
      .eq("org_id", currentOrgId)
      .eq("role", "tracker");

    if (error) {
      console.error("[TrackerDashboard] error fetching memberships trackers", error);
      setErrorMsg(tOr("trackerDashboard.errors.loadMemberships", "Error al cargar trackers (memberships)."));
      setMembershipTrackers([]);
      return;
    }

    const arr = Array.isArray(data) ? data : [];
    const normalized = arr
      .map((r) => ({ user_id: r?.user_id ? String(r.user_id) : null }))
      .filter((r) => !!r.user_id);

    const uniq = Array.from(new Set(normalized.map((x) => x.user_id))).map((user_id) => ({ user_id }));
    setMembershipTrackers(uniq);
  }, [tOr]);

  const fetchPersonalCatalog = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;

    setErrorMsg("");

    const { data, error } = await supabase
      .from("personal")
      .select("*")
      .eq("org_id", currentOrgId)
      .order("nombre", { ascending: true });

    if (error) {
      console.error("[TrackerDashboard] error fetching personal", error);
      setPersonalRows([]);
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

    setPersonalRows(activos);
  }, []);

  const fetchGeofences = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;

    setErrorMsg("");

    const { data, error } = await supabase
      .from("v_geocercas_tracker_ui")
      .select("*")
      .eq("org_id", currentOrgId);

    if (error) {
      console.error("[TrackerDashboard] error fetching geocercas", error);
      setErrorMsg(tOr("trackerDashboard.errors.loadGeofences", "No se pudieron cargar las geocercas."));
      setGeofences([]);
      return;
    }

    const arr = Array.isArray(data) ? data : [];

    arr.sort((a, b) => {
      const labelA = (a.name || a.nombre || a.label || a.id || "").toString().toLowerCase();
      const labelB = (b.name || b.nombre || b.label || b.id || "").toString().toLowerCase();
      return labelA.localeCompare(labelB);
    });

    setGeofences(arr);
  }, [tOr]);

  const fetchPositions = useCallback(
    async (currentOrgId, options = { showSpinner: true }) => {
      if (!currentOrgId) return;

      const { showSpinner } = options;

      try {
        if (showSpinner) setLoading(true);
        setErrorMsg("");

        const windowConfig = TIME_WINDOWS.find((w) => w.id === timeWindowId) ?? TIME_WINDOWS[1];
        const fromIso = new Date(Date.now() - windowConfig.ms).toISOString();

        const allowedTrackerIds = (membershipTrackers || [])
          .map((t) => t?.user_id)
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
          setErrorMsg(tOr("trackerDashboard.errors.loadPositions", "Error al cargar posiciones."));
          return;
        }

        const normalized = (data ?? [])
          .map((r) => {
            const lat = toNum(r.latitude);
            const lng = toNum(r.longitude);
            return {
              id: r.id,
              user_id: r.user_id ? String(r.user_id) : null,
              geocerca_id: r.geocerca_id,
              lat,
              lng,
              accuracy: r.accuracy,
              speed: r.speed,
              recorded_at: r.created_at,
              _valid: isValidLatLng(lat, lng),
            };
          })
          .filter((p) => p._valid);

        setPositions(normalized);
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [membershipTrackers, selectedTrackerId, timeWindowId, tOr]
  );

  useEffect(() => {
    if (!orgId) return;
    setLoadingSummary(true);
    (async () => {
      try {
        await Promise.all([
          fetchMembershipTrackers(orgId),
          fetchPersonalCatalog(orgId),
          fetchGeofences(orgId),
        ]);
      } finally {
        setLoadingSummary(false);
      }
    })();
  }, [orgId, fetchMembershipTrackers, fetchPersonalCatalog, fetchGeofences]);

  useEffect(() => {
    if (!orgId) return;
    if (!membershipTrackers || membershipTrackers.length === 0) {
      setPositions([]);
      return;
    }
    fetchPositions(orgId, { showSpinner: true });
  }, [orgId, membershipTrackers, timeWindowId, selectedTrackerId, fetchPositions]);

  useEffect(() => {
    if (!orgId) return;
    if (!membershipTrackers || membershipTrackers.length === 0) return;
    const id = setInterval(() => {
      fetchPositions(orgId, { showSpinner: false });
    }, 30_000);
    return () => clearInterval(id);
  }, [orgId, membershipTrackers, fetchPositions]);

  const geofenceLabelById = useMemo(() => {
    const m = new Map();
    (geofences || []).forEach((g) => {
      const label = g?.name || g?.nombre || g?.label || g?.id || "";
      if (g?.id) m.set(String(g.id), String(label));
    });
    return m;
  }, [geofences]);

  const personalByUserId = useMemo(() => {
    const m = new Map();
    (personalRows || []).forEach((p) => {
      const uid = resolveTrackerAuthIdFromPersonal(p);
      if (uid) m.set(String(uid), p);
    });
    return m;
  }, [personalRows]);

  const trackersUi = useMemo(() => {
    return (membershipTrackers || []).map((t) => {
      const user_id = String(t.user_id);
      const p = personalByUserId.get(user_id) || null;
      const label = p?.nombre || p?.email || user_id;
      return { user_id, personal: p, label };
    });
  }, [membershipTrackers, personalByUserId]);

  const trackersMissingPersonalSync = useMemo(() => {
    return trackersUi.filter((t) => !t.personal);
  }, [trackersUi]);

  const filteredPositions = useMemo(() => {
    let pts = positions ?? [];
    if (selectedGeofenceId !== "all") {
      const wanted = String(selectedGeofenceId);
      pts = pts.filter((p) => String(p?.geocerca_id || "") === wanted);
    }
    return pts;
  }, [positions, selectedGeofenceId]);

  const pointsByTracker = useMemo(() => {
    const map = new Map();
    for (const p of filteredPositions) {
      if (!p) continue;
      const key = p.user_id || "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return map;
  }, [filteredPositions]);

  const visibleGeofences = useMemo(() => {
    if (selectedGeofenceId === "all") return geofences || [];
    const wanted = String(selectedGeofenceId);
    return (geofences || []).filter((g) => String(g?.id) === wanted);
  }, [geofences, selectedGeofenceId]);

  const totalTrackers = trackersUi.length;
  const totalGeofences = geofences.length;
  const totalPoints = filteredPositions.length;

  const lastPoint = filteredPositions[0] ?? null;
  const lastPointTime = lastPoint?.recorded_at ?? null;

  const mapCenter = useMemo(() => {
    const lat = toNum(lastPoint?.lat);
    const lng = toNum(lastPoint?.lng);
    if (isValidLatLng(lat, lng)) return [lat, lng];
    return [-0.19, -78.48];
  }, [lastPoint]);

  if (!orgId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">
          {tOr("trackerDashboard.title", "Dashboard de Tracking")}
        </h1>
        <p className="text-red-600">
          {tOr(
            "trackerDashboard.errors.noOrg",
            "Error de configuración: no se pudo resolver la organización activa (orgId)."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-semibold leading-tight">
            {tOr("trackerDashboard.title", "Dashboard de Tracking en tiempo real")}
          </h1>
          <p className="text-xs md:text-sm text-slate-500 leading-snug">
            {tOr(
              "trackerDashboard.subtitle",
              "Los puntos se actualizan automáticamente. La frecuencia de envío la define el administrador."
            )}
          </p>

          <p className="text-[11px] text-slate-500">
            {tOr("trackerDashboard.meta.activeOrg", "Org activa")}:{" "}
            <span className="font-mono">{String(orgId)}</span>{" "}
            <span className="ml-2">
              {tOr("trackerDashboard.meta.trackersMemberships", "Trackers (memberships)")}{" "}
              <b>{totalTrackers}</b>
            </span>
            {trackersMissingPersonalSync.length > 0 && (
              <span className="ml-2 text-amber-700">
                | {tOr("trackerDashboard.meta.missingPersonalSync", "Sin sync en Personal")}:{" "}
                <b>{trackersMissingPersonalSync.length}</b>
              </span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:gap-3">
          <label className="text-xs md:text-sm flex items-center gap-2">
            <span className="font-medium">
              {tOr("trackerDashboard.filters.timeWindowLabel", "Ventana")}:
            </span>
            <select
              className="border rounded px-2 py-1 text-xs md:text-sm w-full md:w-auto"
              value={timeWindowId}
              onChange={(e) => setTimeWindowId(e.target.value)}
            >
              {TIME_WINDOWS.map((w) => (
                <option key={w.id} value={w.id}>
                  {tOr(w.labelKey, w.fallback)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs md:text-sm flex items-center gap-2">
            <span className="font-medium">
              {tOr("trackerDashboard.filters.trackerLabel", "Tracker")}:
            </span>
            <select
              className="border rounded px-2 py-1 text-xs md:text-sm w-full md:min-w-[180px]"
              value={selectedTrackerId}
              onChange={(e) => setSelectedTrackerId(e.target.value)}
            >
              <option value="all">
                {tOr("trackerDashboard.filters.allTrackers", "Todos los trackers")}
              </option>
              {trackersUi.map((tRow) => (
                <option key={tRow.user_id} value={tRow.user_id}>
                  {tRow.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs md:text-sm flex items-center gap-2">
            <span className="font-medium">
              {tOr("trackerDashboard.filters.geofenceLabel", "Geocerca")}:
            </span>
            <select
              className="border rounded px-2 py-1 text-xs md:text-sm w-full md:min-w-[180px]"
              value={selectedGeofenceId}
              onChange={(e) => setSelectedGeofenceId(e.target.value)}
            >
              <option value="all">
                {tOr("trackerDashboard.filters.allGeofences", "Todas las geocercas")}
              </option>
              {geofences.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || g.nombre || g.label || g.id}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => fetchPositions(orgId, { showSpinner: true })}
            className="col-span-2 md:col-span-1 border rounded px-3 py-2 md:py-1 text-xs md:text-sm bg-white hover:bg-slate-50"
            disabled={loading || !membershipTrackers?.length}
            title={
              !membershipTrackers?.length
                ? tOr("trackerDashboard.filters.disabledNoTrackers", "No hay trackers en memberships para esta org")
                : ""
            }
          >
            {loading
              ? tOr("common.actions.loading", "Cargando…")
              : tOr("trackerDashboard.filters.refreshNow", "Actualizar ahora")}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-3 md:gap-4">
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="border-b px-2 py-2 md:px-3 md:py-2 flex items-center justify-between">
            <span className="text-xs md:text-sm font-medium">
              {tOr("trackerDashboard.map.title", "Mapa de posiciones")}
            </span>
            <span className="text-[11px] md:text-xs text-slate-500">
              {tOr("trackerDashboard.map.pointsInWindow", "Puntos en ventana")}:{" "}
              <span className="font-semibold">{totalPoints}</span>
            </span>
          </div>

          <div className="h-[65vh] md:h-[480px]">
            <MapContainer center={mapCenter} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <FitToPoints points={filteredPositions} enabled={totalPoints > 0} />

              {visibleGeofences.map((g) => {
                const label = g.name || g.nombre || g.label || g.id;

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

              {Array.from(pointsByTracker.entries()).map(([trackerId, pts], idx) => {
                if (!pts.length) return null;
                const color = TRACKER_COLORS[idx % TRACKER_COLORS.length];

                const latest = pts[0];
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

                const geofenceId = latest?.geocerca_id ? String(latest.geocerca_id) : "";
                const geofenceLabel = geofenceId ? geofenceLabelById.get(geofenceId) : null;

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
                              <strong>{tOr("trackerDashboard.popup.tracker", "Tracker UID")}:</strong> {trackerId}
                            </div>
                            <div>
                              <strong>{tOr("trackerDashboard.popup.time", "Hora")}:</strong>{" "}
                              {formatTime(latest.recorded_at)}
                            </div>
                            <div>
                              <strong>{tOr("trackerDashboard.popup.lat", "Lat")}:</strong> {latestLat.toFixed(6)}
                            </div>
                            <div>
                              <strong>{tOr("trackerDashboard.popup.lng", "Lng")}:</strong> {latestLng.toFixed(6)}
                            </div>
                            <div>
                              <strong>{tOr("trackerDashboard.popup.geofence", "Geocerca")}:</strong>{" "}
                              {geofenceId ? (geofenceLabel ? `${geofenceLabel} (${geofenceId})` : geofenceId) : "—"}
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
                    {membershipTrackers?.length
                      ? tOr(
                          "trackerDashboard.map.noPointsWithTrackers",
                          "No hay posiciones para los filtros/ventana actuales."
                        )
                      : tOr(
                          "trackerDashboard.map.noTrackersInOrg",
                          "No hay trackers (memberships) en esta org."
                        )}
                  </div>
                </div>
              )}
            </MapContainer>
          </div>
        </div>

        <div className="space-y-3 md:space-y-4">
          <div className="rounded-lg border bg-white px-4 py-3">
            <h2 className="text-base md:text-lg font-semibold mb-2 md:mb-3">
              {tOr("trackerDashboard.summary.title", "Resumen")}
            </h2>

            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="font-medium">{tOr("trackerDashboard.summary.geofencesActive", "Geocercas activas")}:</dt>
                <dd>{totalGeofences}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium">{tOr("trackerDashboard.summary.trackersProfiles", "Trackers")}:</dt>
                <dd>{totalTrackers}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium">
                  {tOr("trackerDashboard.legend.missingInPersonal", "Sin sync en Personal")}:
                </dt>
                <dd>{trackersMissingPersonalSync.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium">{tOr("trackerDashboard.summary.pointsInMap", "Puntos en mapa")}:</dt>
                <dd>{totalPoints}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium">{tOr("trackerDashboard.summary.lastPoint", "Último punto registrado")}:</dt>
                <dd>{lastPointTime ? formatDateTime(lastPointTime) : "-"}</dd>
              </div>
            </dl>

            {loadingSummary && (
              <p className="mt-2 md:mt-3 text-xs text-slate-500">
                {tOr("trackerDashboard.summary.updating", "Actualizando datos…")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
