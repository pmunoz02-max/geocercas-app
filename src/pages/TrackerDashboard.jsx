// src/pages/TrackerDashboard.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

import TrackerMap from "../components/tracker/TrackerMap.jsx";

const TIME_WINDOWS = [
  { id: "1h", labelKey: "trackerDashboard.timeWindows.1h", fallback: "1 hora", ms: 1 * 60 * 60 * 1000 },
  { id: "6h", labelKey: "trackerDashboard.timeWindows.6h", fallback: "6 horas", ms: 6 * 60 * 60 * 1000 },
  { id: "12h", labelKey: "trackerDashboard.timeWindows.12h", fallback: "12 horas", ms: 12 * 60 * 60 * 1000 },
  { id: "24h", labelKey: "trackerDashboard.timeWindows.24h", fallback: "24 horas", ms: 24 * 60 * 60 * 1000 },
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
  return row.user_id || row.owner_id || row.auth_user_id || row.auth_uid || row.uid || row.user_uuid || null;
}

/**
 * Resolver robusto de shape: incluye polygon_geojson (clave)
 * y varias alternativas por compatibilidad.
 */
function resolveGeofenceShape(g) {
  if (!g) return null;
  const raw =
    g.geojson ??
    g.polygon_geojson ??
    g.geometry ??
    g.geom ??
    g.polygon ??
    g.shape ??
    g.area_geojson ??
    null;

  const parsed = safeJson(raw);
  return parsed || (typeof raw === "object" ? raw : null);
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

  /**
   * Cargar geocercas:
   * 1) View v_geocercas_tracker_ui (si existe)
   * 2) Fallback tabla geofences (id, name, geojson)
   * Normalizamos __shape y __label para el mapa.
   */
  const fetchGeofences = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;

    setErrorMsg("");

    let rows = [];
    const viewRes = await supabase
      .from("v_geocercas_tracker_ui")
      .select("*")
      .eq("org_id", currentOrgId);

    if (viewRes.error) {
      console.warn("[TrackerDashboard] v_geocercas_tracker_ui failed, fallback geofences:", viewRes.error);

      const tblRes = await supabase
        .from("geofences")
        .select("id, org_id, name, geojson, created_at")
        .eq("org_id", currentOrgId)
        .order("name", { ascending: true });

      if (tblRes.error) {
        console.error("[TrackerDashboard] error fetching geofences", tblRes.error);
        setErrorMsg(tOr("trackerDashboard.errors.loadGeofences", "No se pudieron cargar las geocercas."));
        setGeofences([]);
        return;
      }
      rows = tblRes.data || [];
    } else {
      rows = viewRes.data || [];
    }

    const normalized = (rows || []).map((g) => {
      const label = (g?.name || g?.nombre || g?.label || g?.id || "").toString();
      const shape = resolveGeofenceShape(g);
      return { ...g, __label: label, __shape: shape };
    });

    normalized.sort((a, b) => a.__label.toLowerCase().localeCompare(b.__label.toLowerCase()));
    setGeofences(normalized);
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

  const personalByUserId = useMemo(() => {
    const m = new Map();
    (personalRows || []).forEach((p) => {
      const uid = resolveTrackerAuthIdFromPersonal(p);
      if (uid) m.set(String(uid), p);
    });
    return m;
  }, [personalRows]);

  const trackersUi = useMemo(() => {
    return (membershipTrackers || []).map((tRow) => {
      const user_id = String(tRow.user_id);
      const p = personalByUserId.get(user_id) || null;
      const label = p?.nombre || p?.email || user_id;
      return { user_id, personal: p, label };
    });
  }, [membershipTrackers, personalByUserId]);

  const trackersMissingPersonalSync = useMemo(() => trackersUi.filter((x) => !x.personal), [trackersUi]);

  const filteredPositions = useMemo(() => {
    let pts = positions ?? [];
    if (selectedGeofenceId !== "all") {
      const wanted = String(selectedGeofenceId);
      pts = pts.filter((p) => String(p?.geocerca_id || "") === wanted);
    }
    return pts;
  }, [positions, selectedGeofenceId]);

  const visibleGeofences = useMemo(() => {
    if (selectedGeofenceId === "all") return geofences || [];
    const wanted = String(selectedGeofenceId);
    return (geofences || []).filter((g) => String(g?.id) === wanted);
  }, [geofences, selectedGeofenceId]);

  // Para TrackerMap: pasamos solo shapes válidos (no rompe si hay basura)
  const geofenceShapesForMap = useMemo(() => {
    return (visibleGeofences || [])
      .map((g) => g.__shape)
      .filter(Boolean);
  }, [visibleGeofences]);

  const mapCenter = useMemo(() => {
    const last = filteredPositions[0] ?? null;
    const lat = toNum(last?.lat);
    const lng = toNum(last?.lng);
    if (isValidLatLng(lat, lng)) return [lat, lng];
    return null; // TrackerMap calcula centro por geofence/markers/quito
  }, [filteredPositions]);

  const totalTrackers = trackersUi.length;
  const totalGeofences = geofences.length;
  const totalPoints = filteredPositions.length;

  const lastPoint = filteredPositions[0] ?? null;
  const lastPointTime = lastPoint?.recorded_at ?? null;

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

          <p className="text-[11px] text-slate-500">
            {tOr("trackerDashboard.meta.activeOrg", "Org activa")}:{" "}
            <span className="font-mono">{String(orgId)}</span>{" "}
            <span className="ml-2">
              {tOr("trackerDashboard.meta.trackersMemberships", "Trackers (memberships)")} <b>{totalTrackers}</b>
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
            <span className="font-medium">{tOr("trackerDashboard.filters.timeWindowLabel", "Ventana")}:</span>
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
            <span className="font-medium">{tOr("trackerDashboard.filters.trackerLabel", "Tracker")}:</span>
            <select
              className="border rounded px-2 py-1 text-xs md:text-sm w-full md:min-w-[180px]"
              value={selectedTrackerId}
              onChange={(e) => setSelectedTrackerId(e.target.value)}
            >
              <option value="all">{tOr("trackerDashboard.filters.allTrackers", "Todos los trackers")}</option>
              {trackersUi.map((x) => (
                <option key={x.user_id} value={x.user_id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs md:text-sm flex items-center gap-2">
            <span className="font-medium">{tOr("trackerDashboard.filters.geofenceLabel", "Geocerca")}:</span>
            <select
              className="border rounded px-2 py-1 text-xs md:text-sm w-full md:min-w-[180px]"
              value={selectedGeofenceId}
              onChange={(e) => setSelectedGeofenceId(e.target.value)}
            >
              <option value="all">{tOr("trackerDashboard.filters.allGeofences", "Todas las geocercas")}</option>
              {geofences.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.__label || g.name || g.nombre || g.label || g.id}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => fetchPositions(orgId, { showSpinner: true })}
            className="col-span-2 md:col-span-1 border rounded px-3 py-2 md:py-1 text-xs md:text-sm bg-white hover:bg-slate-50"
            disabled={loading || !membershipTrackers?.length}
            title={!membershipTrackers?.length ? "No hay trackers en memberships para esta org" : ""}
          >
            {loading ? "Cargando…" : "Actualizar ahora"}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded text-sm">
          {errorMsg}
        </div>
      )}

      {/* MAPA (usa TrackerMap para evitar que un GeoJSON inválido “rompa” el render) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-3 md:gap-4">
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="border-b px-2 py-2 md:px-3 md:py-2 flex items-center justify-between">
            <span className="text-xs md:text-sm font-medium">Mapa</span>
            <span className="text-[11px] md:text-xs text-slate-500">
              Puntos: <span className="font-semibold">{totalPoints}</span>
            </span>
          </div>

          <div className="p-2">
            <TrackerMap
              geofences={geofenceShapesForMap}
              positions={(filteredPositions || []).map((p) => ({
                lat: p.lat,
                lng: p.lng,
                user_id: p.user_id,
                recorded_at: p.recorded_at,
              }))}
              center={mapCenter}
              zoom={12}
              className="w-full h-[65vh] md:h-[480px] rounded-lg border border-slate-200 overflow-hidden"
            />

            {!geofenceShapesForMap.length && (
              <div className="mt-2 text-xs text-slate-500">
                No hay geocercas dibujables para los filtros actuales (shape vacío/invalid).
              </div>
            )}
          </div>
        </div>

        {/* RESUMEN */}
        <div className="space-y-3 md:space-y-4">
          <div className="rounded-lg border bg-white px-4 py-3">
            <h2 className="text-base md:text-lg font-semibold mb-2 md:mb-3">Resumen</h2>

            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="font-medium">Geocercas:</dt>
                <dd>{totalGeofences}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium">Trackers:</dt>
                <dd>{totalTrackers}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium">Sin sync en Personal:</dt>
                <dd>{trackersMissingPersonalSync.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium">Puntos en mapa:</dt>
                <dd>{totalPoints}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium">Último punto:</dt>
                <dd>{lastPointTime ? formatDateTime(lastPointTime) : "-"}</dd>
              </div>
              {lastPoint && (
                <div className="text-xs text-slate-500 mt-2">
                  Última hora: {formatTime(lastPoint.recorded_at)} | lat {lastPoint.lat?.toFixed?.(6)} | lng {lastPoint.lng?.toFixed?.(6)}
                </div>
              )}
            </dl>

            {loadingSummary && <p className="mt-2 md:mt-3 text-xs text-slate-500">Actualizando datos…</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
