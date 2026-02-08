// src/pages/TrackerDashboard.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Tooltip,
  Polygon,
  useMap,
} from "react-leaflet";

import L from "leaflet";
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
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
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

// ---------------- STRICT GeoJSON normalization (NO heuristics) ----------------
// GeoJSON siempre es [lng, lat] => Leaflet espera [lat, lng]
function toLatLngStrict(coord) {
  if (!coord) return null;
  if (!Array.isArray(coord) || coord.length < 2) return null;

  const lng = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return [lat, lng];
}

// Devuelve array de "polígonos", cada uno como un ring (outer) en formato [ [lat,lng], ... ]
// (Mantengo tu enfoque: primer anillo / outer ring; suficiente para visibilidad + bounds)
function normalizeGeoJSONToPolygons(input) {
  const polygons = [];
  if (!input) return polygons;

  let obj = input;
  if (typeof input === "string") {
    try { obj = JSON.parse(input); } catch { return polygons; }
  }

  const pushRing = (ring) => {
    if (!Array.isArray(ring)) return;
    const poly = ring.map(toLatLngStrict).filter(Boolean);
    if (poly.length > 2) polygons.push(poly);
  };

  const handleGeometry = (g) => {
    if (!g || typeof g !== "object") return;

    if (g.type === "Polygon") {
      pushRing(g.coordinates?.[0]);
    } else if (g.type === "MultiPolygon") {
      (g.coordinates || []).forEach((poly) => pushRing(poly?.[0]));
    }
  };

  if (obj?.type === "FeatureCollection") {
    (obj.features || []).forEach((f) => handleGeometry(f?.geometry));
    return polygons;
  }
  if (obj?.type === "Feature") {
    handleGeometry(obj.geometry);
    return polygons;
  }
  if (obj?.type) handleGeometry(obj);

  return polygons;
}

// ---------------- Map diagnostics ----------------
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

// Helper: decide fit con pad para evitar falsos positivos de intersección
function shouldFitToBounds(map, bounds) {
  try {
    if (!map || !bounds?.isValid?.()) return false;
    const view = map.getBounds?.();
    if (!view?.isValid?.()) return true;
    // pad del target para hacer la prueba más robusta
    return !view.intersects(bounds.pad(0.05));
  } catch {
    return true;
  }
}

// ✅ FIT inteligente: si la geocerca NO está dentro del viewport actual -> fitBounds
function FitIfOutOfView({ geofencePolygons, fitSignal, onBoundsComputed, onViewportComputed }) {
  const map = useMap();

  const bounds = useMemo(() => {
    try {
      const all = [];
      (geofencePolygons || []).forEach((g) => (g.positions || []).forEach((p) => all.push(p)));
      if (all.length < 3) return null;
      const b = L.latLngBounds(all);
      return b.isValid() ? b : null;
    } catch {
      return null;
    }
  }, [geofencePolygons]);

  useEffect(() => {
    if (!map) return;

    // viewport debug siempre
    try {
      const v = map.getBounds?.();
      if (v?.isValid?.()) onViewportComputed?.(v);
    } catch {}

    if (!bounds) return;

    // expone bounds a UI
    onBoundsComputed?.(bounds);

    // fit: si botón presionado => siempre fit; si no => fit sólo si fuera de view
    try {
      const force = fitSignal > 0;
      const doFit = force ? true : shouldFitToBounds(map, bounds);

      if (doFit) {
        map.fitBounds(bounds, { padding: [24, 24] });
        // Actualiza viewport después del fit (para debug UI)
        setTimeout(() => {
          try {
            const v2 = map.getBounds?.();
            if (v2?.isValid?.()) onViewportComputed?.(v2);
          } catch {}
        }, 50);
      } else {
        // igual refresca viewport por debug
        const v = map.getBounds?.();
        if (v?.isValid?.()) onViewportComputed?.(v);
      }
    } catch {
      // ignore
    }
  }, [map, bounds, fitSignal, onBoundsComputed, onViewportComputed]);

  return null;
}

export default function TrackerDashboard() {
  const { t } = useTranslation();
  const tOr = useCallback((key, fallback) => t(key, { defaultValue: fallback }), [t]);

  const { currentOrg } = useAuth();
  const orgId = typeof currentOrg === "string" ? currentOrg : currentOrg?.id || currentOrg?.org_id || null;

  const mapRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [timeWindowId, setTimeWindowId] = useState("6h");
  const [selectedTrackerId, setSelectedTrackerId] = useState("all");

  const [assignments, setAssignments] = useState([]);
  const [assignmentTrackers, setAssignmentTrackers] = useState([]);
  const [personalRows, setPersonalRows] = useState([]);
  const [positions, setPositions] = useState([]);

  const [geofenceRows, setGeofenceRows] = useState([]);

  const [geoDbg, setGeoDbg] = useState({
    rows: 0,
    firstType: null,
    geomType: null,
    parseOk: null,
    polysComputed: 0,
  });

  const geofencePolygons = useMemo(() => {
    const out = [];
    for (const g of geofenceRows || []) {
      const polys = normalizeGeoJSONToPolygons(g.geojson);
      polys.forEach((p, i) => out.push({ geofenceId: g.id, name: g.name || g.id, positions: p, idx: i }));
    }
    return out;
  }, [geofenceRows]);

  const [diag, setDiag] = useState({
    mapCreated: false,
    w: 0,
    h: 0,
    zoom: null,
    assignmentsRows: 0,
    trackersFound: 0,
    geofencesFound: 0,
    geofencePolys: 0,
    positionsFound: 0,
    lastAssignmentsError: null,
    lastGeofencesError: null,
    lastPositionsError: null,
    lastFromIso: null,
    lastTargetCount: 0,
  });

  const [geofenceBoundsText, setGeofenceBoundsText] = useState("—");
  const [viewportText, setViewportText] = useState("—");
  const [intersectsText, setIntersectsText] = useState("—");
  const [fitSignal, setFitSignal] = useState(0);

  const todayStrUtc = useMemo(() => {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const fetchAssignments = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;
    setDiag((d) => ({ ...d, lastAssignmentsError: null }));

    const orVigencia =
      `and(start_date.is.null,end_date.is.null),` +
      `and(start_date.is.null,end_date.gte.${todayStrUtc}),` +
      `and(start_date.lte.${todayStrUtc},end_date.is.null),` +
      `and(start_date.lte.${todayStrUtc},end_date.gte.${todayStrUtc})`;

    const { data, error } = await supabase
      .from("tracker_assignments")
      .select("tracker_user_id, geofence_id, org_id, active, start_date, end_date")
      .eq("org_id", currentOrgId)
      .eq("active", true)
      .or(orVigencia);

    if (error) {
      setDiag((d) => ({ ...d, lastAssignmentsError: error.message || String(error) }));
      setAssignments([]);
      setAssignmentTrackers([]);
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    setAssignments(rows);

    const uniqTrackers = Array.from(new Set(rows.map((r) => String(r.tracker_user_id)).filter(Boolean)))
      .map((user_id) => ({ user_id }));

    setAssignmentTrackers(uniqTrackers);

    setDiag((d) => ({ ...d, assignmentsRows: rows.length, trackersFound: uniqTrackers.length }));
  }, [todayStrUtc]);

  const fetchGeofences = useCallback(async (currentOrgId, assignmentRows) => {
    if (!currentOrgId) return;
    setDiag((d) => ({ ...d, lastGeofencesError: null }));

    const geofenceIds = Array.from(new Set((assignmentRows || []).map((r) => r?.geofence_id).filter(Boolean).map(String)));

    if (!geofenceIds.length) {
      setGeofenceRows([]);
      setDiag((d) => ({ ...d, geofencesFound: 0, geofencePolys: 0 }));
      setGeoDbg({ rows: 0, firstType: null, geomType: null, parseOk: null, polysComputed: 0 });
      setGeofenceBoundsText("—");
      setViewportText("—");
      setIntersectsText("—");
      return;
    }

    const { data, error } = await supabase
      .from("v_geofences_ui")
      .select("id, org_id, name, geojson, geom_type")
      .eq("org_id", currentOrgId)
      .in("id", geofenceIds);

    if (error) {
      setDiag((d) => ({ ...d, lastGeofencesError: error.message || String(error) }));
      setGeofenceRows([]);
      setGeoDbg({ rows: 0, firstType: null, geomType: null, parseOk: false, polysComputed: 0 });
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    const normalized = rows.map((r) => ({
      id: r.id,
      name: r.name || r.id,
      geojson: r.geojson,
      geom_type: r.geom_type || null,
    }));

    const polysCount = normalized.reduce((acc, g) => acc + normalizeGeoJSONToPolygons(g.geojson).length, 0);

    setGeofenceRows(normalized);
    setDiag((d) => ({ ...d, geofencesFound: normalized.length, geofencePolys: polysCount }));

    const first = normalized[0] || null;
    let firstType = null;
    let parseOk = null;
    let firstPolys = 0;

    if (first?.geojson != null) {
      try {
        const obj = typeof first.geojson === "string" ? JSON.parse(first.geojson) : first.geojson;
        firstType = obj?.type ?? null;
        parseOk = true;
      } catch {
        parseOk = false;
      }
      firstPolys = normalizeGeoJSONToPolygons(first.geojson).length;
    }

    setGeoDbg({
      rows: normalized.length,
      firstType,
      geomType: first?.geom_type ?? null,
      parseOk,
      polysComputed: firstPolys,
    });

    // 🔥 dispara un fit inicial (para garantizar visibilidad)
    setFitSignal((x) => x + 1);
  }, []);

  const fetchPersonalCatalog = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;
    const { data, error } = await supabase
      .from("personal")
      .select("*")
      .eq("org_id", currentOrgId)
      .order("nombre", { ascending: true });

    if (error) {
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

      const allowedTrackerIds = (assignmentTrackers || []).map((x) => x.user_id).filter(Boolean);

      setDiag((d) => ({ ...d, lastFromIso: fromIso, lastTargetCount: allowedTrackerIds.length }));

      if (!allowedTrackerIds.length) {
        setPositions([]);
        setDiag((d) => ({ ...d, positionsFound: 0 }));
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
  }, [assignmentTrackers, selectedTrackerId, timeWindowId]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      await Promise.all([fetchAssignments(orgId), fetchPersonalCatalog(orgId)]);
    })();
  }, [orgId, fetchAssignments, fetchPersonalCatalog]);

  useEffect(() => {
    if (!orgId) return;
    fetchGeofences(orgId, assignments);
  }, [orgId, assignments, fetchGeofences]);

  useEffect(() => {
    if (!orgId) return;
    fetchPositions(orgId, { showSpinner: true });
  }, [orgId, assignmentTrackers, timeWindowId, selectedTrackerId, fetchPositions]);

  const personalByUserId = useMemo(() => {
    const m = new Map();
    (personalRows || []).forEach((p) => {
      const uid = resolveTrackerAuthIdFromPersonal(p);
      if (uid) m.set(String(uid), p);
    });
    return m;
  }, [personalRows]);

  const trackersUi = useMemo(() => {
    return (assignmentTrackers || []).map((tRow) => {
      const user_id = String(tRow.user_id);
      const p = personalByUserId.get(user_id) || null;
      const label = p?.nombre || p?.email || user_id;
      return { user_id, label };
    });
  }, [assignmentTrackers, personalByUserId]);

  const mapCenter = useMemo(() => {
    const last = positions?.[0];
    if (last && isValidLatLng(last.lat, last.lng)) return [last.lat, last.lng];
    if (geofencePolygons.length && geofencePolygons[0]?.positions?.length) return geofencePolygons[0].positions[0];
    return [-0.22985, -78.52495];
  }, [positions, geofencePolygons]);

  const pointsByTracker = useMemo(() => {
    const map = new Map();
    for (const p of positions || []) {
      const key = p.user_id || "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return map;
  }, [positions]);

  return (
    <div className="p-3 md:p-6 space-y-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Tracker Dashboard</h1>
          <div className="text-[11px] text-slate-500">
            Org: <span className="font-mono">{String(orgId || "—")}</span>
          </div>
          <div className="text-[11px] text-slate-500">
            Bounds geocerca: <span className="font-mono">{geofenceBoundsText}</span>
          </div>
          <div className="text-[11px] text-slate-500">
            Viewport mapa: <span className="font-mono">{viewportText}</span> | intersects:{" "}
            <span className="font-mono">{intersectsText}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:gap-3">
          <label className="text-xs flex items-center gap-2">
            <span className="font-medium">Ventana:</span>
            <select className="border rounded px-2 py-1 text-xs" value={timeWindowId} onChange={(e) => setTimeWindowId(e.target.value)}>
              {TIME_WINDOWS.map((w) => (
                <option key={w.id} value={w.id}>
                  {tOr(w.labelKey, w.fallback)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs flex items-center gap-2">
            <span className="font-medium">Tracker:</span>
            <select className="border rounded px-2 py-1 text-xs min-w-[180px]" value={selectedTrackerId} onChange={(e) => setSelectedTrackerId(e.target.value)}>
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
            className="border rounded px-3 py-2 text-xs bg-white hover:bg-slate-50"
            disabled={loading}
          >
            {loading ? "Cargando…" : "Actualizar"}
          </button>

          <button
            type="button"
            onClick={() => setFitSignal((x) => x + 1)}
            className="border rounded px-3 py-2 text-xs bg-white hover:bg-slate-50"
          >
            Centrar geocerca
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded text-sm">
          {errorMsg}
        </div>
      )}

      <div className="rounded border bg-white p-3 text-xs grid grid-cols-2 md:grid-cols-6 gap-2">
        <div><b>assignmentsRows</b>: {diag.assignmentsRows}</div>
        <div><b>trackersFound</b>: {diag.trackersFound}</div>
        <div><b>positionsFound</b>: {diag.positionsFound}</div>
        <div><b>geofencesFound</b>: {diag.geofencesFound}</div>
        <div><b>geofencePolys</b>: {diag.geofencePolys}</div>
        <div><b>targets</b>: {diag.lastTargetCount}</div>

        <div className="col-span-2 md:col-span-6 text-[11px] text-slate-500">
          <b>fromIso</b>: {diag.lastFromIso || "—"}
        </div>

        <div className="col-span-2 md:col-span-6 text-[11px] text-slate-500">
          <b>assignErr</b>: {diag.lastAssignmentsError || "—"} | <b>geoErr</b>: {diag.lastGeofencesError || "—"} | <b>posErr</b>: {diag.lastPositionsError || "—"}
        </div>

        <div className="col-span-2 md:col-span-6 text-[11px] text-slate-500">
          <b>geoDbg</b>: rows={geoDbg.rows} geom_type={String(geoDbg.geomType)} geojson_type={String(geoDbg.firstType)} polys(first)={geoDbg.polysComputed}
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden" style={{ height: 520, minHeight: 420 }}>
        <MapContainer
          center={mapCenter}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
          whenCreated={(map) => {
            mapRef.current = map;
            try { map.invalidateSize(); } catch {}
          }}
          whenReady={() => {
            // fuerza invalidación al estar listo (por layouts dinámicos)
            try { mapRef.current?.invalidateSize?.(); } catch {}
          }}
        >
          <MapDiagnostics setDiag={setDiag} />

          <FitIfOutOfView
            geofencePolygons={geofencePolygons}
            fitSignal={fitSignal}
            onBoundsComputed={(b) => {
              try {
                const sw = b.getSouthWest();
                const ne = b.getNorthEast();
                setGeofenceBoundsText(
                  `SW(${sw.lat.toFixed(5)},${sw.lng.toFixed(5)}) NE(${ne.lat.toFixed(5)},${ne.lng.toFixed(5)})`
                );

                // intersects info (si ya hay viewport)
                const v = mapRef.current?.getBounds?.();
                if (v?.isValid?.()) {
                  setIntersectsText(String(v.intersects(b.pad(0.05))));
                }
              } catch {
                setGeofenceBoundsText("—");
              }
            }}
            onViewportComputed={(v) => {
              try {
                const sw = v.getSouthWest();
                const ne = v.getNorthEast();
                setViewportText(`SW(${sw.lat.toFixed(5)},${sw.lng.toFixed(5)}) NE(${ne.lat.toFixed(5)},${ne.lng.toFixed(5)})`);

                // intersects info (si ya hay bounds)
                const all = [];
                geofencePolygons.forEach((g) => (g.positions || []).forEach((p) => all.push(p)));
                if (all.length >= 3) {
                  const b = L.latLngBounds(all);
                  if (b?.isValid?.()) setIntersectsText(String(v.intersects(b.pad(0.05))));
                }
              } catch {
                setViewportText("—");
              }
            }}
          />

          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
          />

          {geofencePolygons.map((g) => (
            <Polygon
              key={`${g.geofenceId}-${g.idx}`}
              positions={g.positions}
              pathOptions={{
                color: "#2563eb",
                weight: 4,
                opacity: 1,
                fillOpacity: 0.25,
              }}
            >
              <Tooltip sticky>{g.name}</Tooltip>
            </Polygon>
          ))}

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
