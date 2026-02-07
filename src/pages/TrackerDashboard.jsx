// src/pages/TrackerDashboard.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Tooltip,
  useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

const TIME_WINDOWS = [
  { id: "1h", labelKey: "trackerDashboard.timeWindows.1h", fallback: "1 hora", ms: 1 * 60 * 60 * 1000 },
  { id: "6h", labelKey: "trackerDashboard.timeWindows.6h", fallback: "6 horas", ms: 6 * 60 * 60 * 1000 },
  { id: "12h", labelKey: "trackerDashboard.timeWindows.12h", fallback: "12 horas", ms: 12 * 60 * 60 * 1000 },
  { id: "24h", labelKey: "trackerDashboard.timeWindows.24h", fallback: "24 horas", ms: 24 * 60 * 60 * 1000 },
];

const TRACKER_COLORS = ["#2563eb", "#16a34a", "#f97316", "#dc2626", "#7c3aed", "#0d9488"];

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

function formatTime(dtString) {
  if (!dtString) return "-";
  try {
    return new Date(dtString).toLocaleTimeString();
  } catch {
    return dtString;
  }
}

function resolveTrackerAuthIdFromPersonal(row) {
  if (!row) return null;
  return row.user_id || row.owner_id || row.auth_user_id || row.auth_uid || row.uid || row.user_uuid || null;
}

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase();
}

function isTrackerRole(role) {
  const r = normalizeRole(role);
  // Universal/permanente: acepta "tracker", "Tracker", "tracker ", "tracker_device", "tracker:xyz"
  return r === "tracker" || r.startsWith("tracker");
}

/** Diagnóstico interno del mapa: tamaño + invalidateSize */
function MapDiagnostics({ setDiag }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const container = map.getContainer();
    const updateSize = () => {
      const r = container?.getBoundingClientRect?.();
      setDiag((d) => ({
        ...d,
        mapCreated: true,
        w: Math.round(r?.width ?? 0),
        h: Math.round(r?.height ?? 0),
        zoom: map.getZoom?.() ?? null,
      }));
    };

    const doInvalidate = () => {
      try { map.invalidateSize(); } catch {}
      updateSize();
    };

    doInvalidate();
    const t1 = setTimeout(doInvalidate, 0);
    const t2 = setTimeout(doInvalidate, 250);
    const t3 = setTimeout(doInvalidate, 1000);

    let ro = null;
    try {
      ro = new ResizeObserver(() => doInvalidate());
      ro.observe(container);
    } catch {}

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      try { ro?.disconnect?.(); } catch {}
    };
  }, [map, setDiag]);

  return null;
}

export default function TrackerDashboard() {
  const { t } = useTranslation();
  const tOr = useCallback((key, fallback) => t(key, { defaultValue: fallback }), [t]);

  const { currentOrg } = useAuth();
  const orgId =
    typeof currentOrg === "string" ? currentOrg : currentOrg?.id || currentOrg?.org_id || null;

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [timeWindowId, setTimeWindowId] = useState("6h");
  const [selectedTrackerId, setSelectedTrackerId] = useState("all");

  const [membershipTrackers, setMembershipTrackers] = useState([]); // [{user_id}]
  const [personalRows, setPersonalRows] = useState([]);
  const [positions, setPositions] = useState([]);

  // DIAG
  const [diag, setDiag] = useState({
    mapCreated: false,
    w: 0,
    h: 0,
    zoom: null,
    tileLoads: 0,
    tileErrors: 0,
    lastTileError: null,

    membershipsRows: 0,
    trackersFound: 0,
    positionsFound: 0,
    lastMembershipError: null,
    lastPositionsError: null,
    lastFromIso: null,
    lastTargetCount: 0,
  });

  /**
   * UNIVERSAL Y PERMANENTE:
   * - 1er intento: filtra server-side por role ilike 'tracker%' (case-insensitive)
   * - fallback: si llega vacío, trae memberships sin filtro y filtra client-side
   */
  const fetchMembershipTrackers = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;

    setDiag((d) => ({ ...d, lastMembershipError: null }));

    // Intento 1: server-side, tolerante a mayúsculas y variantes
    const q1 = await supabase
      .from("memberships")
      .select("user_id, role, org_id")
      .eq("org_id", currentOrgId)
      .ilike("role", "tracker%");

    if (q1.error) {
      console.error("[TrackerDashboard] memberships trackers error (q1)", q1.error);
      setDiag((d) => ({ ...d, lastMembershipError: q1.error.message || String(q1.error) }));
      setMembershipTrackers([]);
      return;
    }

    let rows = Array.isArray(q1.data) ? q1.data : [];
    let trackers = rows.filter((r) => isTrackerRole(r?.role));

    // Fallback: si vino vacío, trae memberships sin filtro y filtra local (universal)
    if (!trackers.length) {
      const q2 = await supabase
        .from("memberships")
        .select("user_id, role, org_id")
        .eq("org_id", currentOrgId);

      if (q2.error) {
        console.error("[TrackerDashboard] memberships trackers error (q2)", q2.error);
        setDiag((d) => ({ ...d, lastMembershipError: q2.error.message || String(q2.error) }));
        setMembershipTrackers([]);
        return;
      }

      rows = Array.isArray(q2.data) ? q2.data : [];
      trackers = rows.filter((r) => isTrackerRole(r?.role));
    }

    const uniq = Array.from(
      new Set(trackers.map((r) => String(r.user_id)).filter(Boolean))
    ).map((user_id) => ({ user_id }));

    setDiag((d) => ({
      ...d,
      membershipsRows: rows.length,
      trackersFound: uniq.length,
    }));

    setMembershipTrackers(uniq);
  }, []);

  const fetchPersonalCatalog = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;

    const { data, error } = await supabase
      .from("personal")
      .select("*")
      .eq("org_id", currentOrgId)
      .order("nombre", { ascending: true });

    if (error) {
      console.error("[TrackerDashboard] personal error", error);
      setPersonalRows([]);
      return;
    }

    setPersonalRows(Array.isArray(data) ? data : []);
  }, []);

  const fetchPositions = useCallback(async (currentOrgId, options = { showSpinner: true }) => {
    if (!currentOrgId) return;
    const { showSpinner } = options;

    try {
      if (showSpinner) setLoading(true);
      setErrorMsg("");
      setDiag((d) => ({ ...d, lastPositionsError: null }));

      const windowConfig = TIME_WINDOWS.find((w) => w.id === timeWindowId) ?? TIME_WINDOWS[1];
      const fromIso = new Date(Date.now() - windowConfig.ms).toISOString();

      const allowedTrackerIds = (membershipTrackers || []).map((x) => x.user_id).filter(Boolean);

      setDiag((d) => ({
        ...d,
        lastFromIso: fromIso,
        lastTargetCount: allowedTrackerIds.length,
      }));

      if (!allowedTrackerIds.length) {
        // Clave: esto explica por qué nunca ves tracker_positions en Network
        setPositions([]);
        setDiag((d) => ({ ...d, positionsFound: 0 }));
        setErrorMsg("No hay trackers en memberships para esta org (role tracker).");
        return;
      }

      let targetIds = allowedTrackerIds;
      if (selectedTrackerId !== "all") {
        const wanted = String(selectedTrackerId);
        targetIds = allowedTrackerIds.includes(wanted) ? [wanted] : allowedTrackerIds;
      }

      const { data, error } = await supabase
        .from("tracker_positions")
        .select("id, user_id, latitude, longitude, accuracy, created_at")
        .gte("created_at", fromIso)
        .in("user_id", targetIds)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        console.error("[TrackerDashboard] positions error", error);
        setDiag((d) => ({ ...d, lastPositionsError: error.message || String(error) }));
        setErrorMsg("Error al cargar posiciones.");
        return;
      }

      const normalized = (data || [])
        .map((r) => {
          const lat = toNum(r.latitude);
          const lng = toNum(r.longitude);
          return {
            id: r.id,
            user_id: r.user_id ? String(r.user_id) : null,
            lat,
            lng,
            recorded_at: r.created_at,
            _valid: isValidLatLng(lat, lng),
          };
        })
        .filter((p) => p._valid);

      setPositions(normalized);
      setDiag((d) => ({ ...d, positionsFound: normalized.length }));
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [membershipTrackers, selectedTrackerId, timeWindowId]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      await Promise.all([fetchMembershipTrackers(orgId), fetchPersonalCatalog(orgId)]);
    })();
  }, [orgId, fetchMembershipTrackers, fetchPersonalCatalog]);

  useEffect(() => {
    if (!orgId) return;
    fetchPositions(orgId, { showSpinner: true });
  }, [orgId, membershipTrackers, timeWindowId, selectedTrackerId, fetchPositions]);

  useEffect(() => {
    if (!orgId) return;
    if (!membershipTrackers?.length) return;
    const id = setInterval(() => fetchPositions(orgId, { showSpinner: false }), 30_000);
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
      return { user_id, label };
    });
  }, [membershipTrackers, personalByUserId]);

  const mapCenter = useMemo(() => {
    const last = positions?.[0];
    if (last && isValidLatLng(last.lat, last.lng)) return [last.lat, last.lng];
    return [-0.22985, -78.52495]; // Quito
  }, [positions]);

  const pointsByTracker = useMemo(() => {
    const map = new Map();
    for (const p of positions || []) {
      const key = p.user_id || "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return map;
  }, [positions]);

  if (!orgId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-3">Tracker Dashboard</h1>
        <p className="text-red-600">No se pudo resolver orgId.</p>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Tracker Dashboard (DEBUG MAP)</h1>
          <div className="text-[11px] text-slate-500">
            Org: <span className="font-mono">{String(orgId)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:gap-3">
          <label className="text-xs flex items-center gap-2">
            <span className="font-medium">Ventana:</span>
            <select
              className="border rounded px-2 py-1 text-xs"
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

          <label className="text-xs flex items-center gap-2">
            <span className="font-medium">Tracker:</span>
            <select
              className="border rounded px-2 py-1 text-xs min-w-[180px]"
              value={selectedTrackerId}
              onChange={(e) => setSelectedTrackerId(e.target.value)}
            >
              <option value="all">Todos</option>
              {trackersUi.map((x) => (
                <option key={x.user_id} value={x.user_id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => fetchPositions(orgId, { showSpinner: true })}
            className="col-span-2 md:col-span-1 border rounded px-3 py-2 text-xs bg-white hover:bg-slate-50"
            disabled={loading}
          >
            {loading ? "Cargando…" : "Actualizar"}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded text-sm">
          {errorMsg}
        </div>
      )}

      {/* Panel diagnóstico */}
      <div className="rounded border bg-white p-3 text-xs grid grid-cols-2 md:grid-cols-6 gap-2">
        <div><b>mapCreated</b>: {String(diag.mapCreated)}</div>
        <div><b>size</b>: {diag.w}x{diag.h}</div>
        <div><b>zoom</b>: {String(diag.zoom)}</div>
        <div><b>tiles ok</b>: {diag.tileLoads}</div>
        <div><b>tiles err</b>: {diag.tileErrors}</div>
        <div className="col-span-2 md:col-span-6 text-[11px] text-slate-500">
          <b>lastTileError</b>: {diag.lastTileError || "—"}
        </div>

        <div><b>membershipsRows</b>: {diag.membershipsRows}</div>
        <div><b>trackersFound</b>: {diag.trackersFound}</div>
        <div><b>targets</b>: {diag.lastTargetCount}</div>
        <div><b>positionsFound</b>: {diag.positionsFound}</div>
        <div className="col-span-2 md:col-span-6 text-[11px] text-slate-500">
          <b>fromIso</b>: {diag.lastFromIso || "—"}
        </div>
        <div className="col-span-2 md:col-span-6 text-[11px] text-slate-500">
          <b>lastMembershipError</b>: {diag.lastMembershipError || "—"} |{" "}
          <b>lastPositionsError</b>: {diag.lastPositionsError || "—"}
        </div>
      </div>

      {/* Contenedor MAPA con altura FORZADA */}
      <div className="rounded-lg border bg-white overflow-hidden" style={{ height: 520, minHeight: 420 }}>
        <MapContainer
          center={mapCenter}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
          whenCreated={(map) => {
            try { map.invalidateSize(); } catch {}
          }}
        >
          <MapDiagnostics setDiag={setDiag} />

          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
            eventHandlers={{
              tileload: () => setDiag((d) => ({ ...d, tileLoads: d.tileLoads + 1 })),
              tileerror: (e) => {
                const url = e?.tile?.src || "tileerror";
                console.warn("[TileLayer] tileerror:", url);
                setDiag((d) => ({ ...d, tileErrors: d.tileErrors + 1, lastTileError: String(url) }));
              },
            }}
          />

          {/* Puntos/rutas */}
          {Array.from(pointsByTracker.entries()).map(([trackerId, pts], idx) => {
            const color = TRACKER_COLORS[idx % TRACKER_COLORS.length];
            const chron = [...pts].reverse();
            const latlngs = chron.map((p) => [p.lat, p.lng]).filter(Boolean);

            const latest = pts[0];
            if (!latest) return null;

            return (
              <React.Fragment key={trackerId}>
                {latlngs.length > 1 && <Polyline positions={latlngs} pathOptions={{ color, weight: 3 }} />}

                <CircleMarker
                  center={[latest.lat, latest.lng]}
                  radius={7}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 2 }}
                >
                  <Tooltip direction="top">
                    <div className="text-xs">
                      <div><b>Tracker</b>: {trackerId}</div>
                      <div><b>Hora</b>: {formatTime(latest.recorded_at)}</div>
                      <div><b>Lat</b>: {latest.lat.toFixed(6)}</div>
                      <div><b>Lng</b>: {latest.lng.toFixed(6)}</div>
                    </div>
                  </Tooltip>
                </CircleMarker>
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
