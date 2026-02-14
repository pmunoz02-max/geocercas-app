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
  Circle,
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
  try { return new Date(dtString).toLocaleTimeString(); } catch { return dtString; }
}

function resolveTrackerAuthIdFromPersonal(row) {
  if (!row) return null;
  return row.user_id || row.owner_id || row.auth_user_id || row.auth_uid || row.uid || row.user_uuid || null;
}

// GeoJSON siempre es [lng,lat] => Leaflet [lat,lng]
function toLatLngStrict(coord) {
  if (!coord || !Array.isArray(coord) || coord.length < 2) return null;
  const lng = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

function parseMaybeJson(input) {
  if (!input) return null;
  if (typeof input === "object") return input;
  if (typeof input === "string") {
    try { return JSON.parse(input); } catch { return null; }
  }
  return null;
}

function normalizeGeoJSONToPolygons(input) {
  const polygons = [];
  if (!input) return polygons;

  const obj = parseMaybeJson(input);
  if (!obj) return polygons;

  const pushRing = (ring) => {
    if (!Array.isArray(ring)) return;
    const poly = ring.map(toLatLngStrict).filter(Boolean);
    if (poly.length > 2) polygons.push(poly);
  };

  const handleGeometry = (g) => {
    if (!g || typeof g !== "object") return;
    if (g.type === "Polygon") pushRing(g.coordinates?.[0]);
    else if (g.type === "MultiPolygon") (g.coordinates || []).forEach((poly) => pushRing(poly?.[0]));
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

function boundsFromPolys(polys) {
  try {
    const all = [];
    (polys || []).forEach((ring) => (ring || []).forEach((p) => all.push(p)));
    if (all.length < 3) return null;
    const b = L.latLngBounds(all);
    return b.isValid() ? b : null;
  } catch {
    return null;
  }
}

function isProbablyZeroZeroBounds(b) {
  try {
    if (!b?.isValid?.()) return false;
    const c = b.getCenter();
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const w = Math.abs(ne.lng - sw.lng);
    const h = Math.abs(ne.lat - sw.lat);
    const nearZero = Math.abs(c.lat) < 0.01 && Math.abs(c.lng) < 0.01;
    const tiny = w < 0.01 && h < 0.01;
    return nearZero && tiny;
  } catch {
    return false;
  }
}

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

function shouldFitToBounds(map, bounds) {
  try {
    if (!map || !bounds?.isValid?.()) return false;
    const view = map.getBounds?.();
    if (!view?.isValid?.()) return true;
    return !view.intersects(bounds.pad(0.05));
  } catch {
    return true;
  }
}

function FitIfOutOfView({ layerItems, fitSignal, onBoundsComputed, onViewportComputed }) {
  const map = useMap();
  const lastFitSignalRef = useRef(0);

  const bounds = useMemo(() => {
    try {
      const pts = [];
      (layerItems || []).forEach((it) => {
        if (it.type === "polygon") (it.positions || []).forEach((p) => pts.push(p));
        else if (it.type === "circle") {
          if (Array.isArray(it.center) && it.center.length >= 2) pts.push(it.center);
        }
      });
      if (pts.length < 1) return null;
      const b = L.latLngBounds(pts);
      return b.isValid() ? b : null;
    } catch {
      return null;
    }
  }, [layerItems]);

  useEffect(() => {
    if (!map) return;

    try {
      const v = map.getBounds?.();
      if (v?.isValid?.()) onViewportComputed?.(v);
    } catch {}

    if (!bounds) return;
    onBoundsComputed?.(bounds);

    try {
      const force = fitSignal > lastFitSignalRef.current;
      const doFit = force ? true : shouldFitToBounds(map, bounds);

      if (doFit) {
        map.fitBounds(bounds, { padding: [24, 24] });
        lastFitSignalRef.current = fitSignal;
      }
    } catch {}
  }, [map, bounds, fitSignal, onBoundsComputed, onViewportComputed]);

  return null;
}

// -----------------------
// MultiSelect Geocercas UI
// -----------------------
function MultiGeofenceSelect({ geofences, selectedIds, setSelectedIds, disabled }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef(null);

  const selectedSet = useMemo(() => new Set((selectedIds || []).map(String)), [selectedIds]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const rows = Array.isArray(geofences) ? geofences : [];
    if (!qq) return rows;
    return rows.filter((g) => {
      const name = String(g?.name || "").toLowerCase();
      const id = String(g?.id || "").toLowerCase();
      return name.includes(qq) || id.includes(qq);
    });
  }, [geofences, q]);

  const isNoneMode = useMemo(() => Array.isArray(selectedIds) && selectedIds.length === 1 && selectedIds[0] === "__none__", [selectedIds]);

  const effectiveSelectedCount = useMemo(() => {
    if (!geofences?.length) return 0;
    if (isNoneMode) return 0;
    return selectedIds?.length ? selectedIds.length : geofences.length;
  }, [geofences, selectedIds, isNoneMode]);

  const label = useMemo(() => {
    if (!geofences?.length) return "Geocercas";
    if (isNoneMode) return "Geocercas: Ninguna";
    if (!selectedIds?.length) return `Geocercas: Todas (${geofences.length})`;
    return `Geocercas: ${effectiveSelectedCount}`;
  }, [geofences, selectedIds, effectiveSelectedCount, isNoneMode]);

  const toggle = (id) => {
    const sid = String(id);
    setSelectedIds((prev) => {
      const arr = Array.isArray(prev) ? prev.map(String) : [];

      if (arr.length === 1 && arr[0] === "__none__") return [sid];

      if (arr.length === 0) {
        const all = (geofences || []).map((g) => String(g.id));
        return all.filter((x) => x !== sid);
      }

      const set = new Set(arr);
      if (set.has(sid)) set.delete(sid);
      else set.add(sid);

      const next = Array.from(set);
      return next.length ? next : [];
    });
  };

  const setAll = () => setSelectedIds([]);
  const setNone = () => setSelectedIds(["__none__"]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const isChecked = (id) => {
    if (isNoneMode) return false;
    if (!selectedIds?.length) return true;
    return selectedSet.has(String(id));
  };

  const countText = useMemo(() => {
    if (!geofences?.length) return "0";
    if (isNoneMode) return "0";
    if (!selectedIds?.length) return String(geofences.length);
    return String(selectedIds.length);
  }, [geofences, selectedIds, isNoneMode]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={[
          "w-full",
          "bg-white text-gray-900",
          "border border-gray-300 rounded-md",
          "px-3 py-2 text-sm",
          "flex items-center justify-between gap-2",
          "hover:bg-gray-50",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
          disabled ? "opacity-60 cursor-not-allowed" : "",
        ].join(" ")}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
      >
        <span className="truncate">{label}</span>
        <span className="text-gray-500 text-xs">
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 border border-gray-200">
            {countText}
          </span>
        </span>
      </button>

      {open && !disabled && (
        <div className="absolute left-0 mt-2 w-[360px] max-w-[92vw] bg-white border border-gray-200 rounded-lg shadow-xl p-3 z-[9999]">
          <div className="flex items-center gap-2 mb-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar geocerca…"
              className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              className="border border-gray-300 bg-white text-gray-900 rounded-md px-2.5 py-1.5 text-sm hover:bg-gray-50
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onClick={setAll}
            >
              Mostrar todas
            </button>
            <button
              type="button"
              className="border border-gray-300 bg-white text-gray-900 rounded-md px-2.5 py-1.5 text-sm hover:bg-gray-50
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onClick={setNone}
            >
              Ocultar todas
            </button>

            <div className="ml-auto text-xs text-gray-500">
              {filtered.length}/{geofences?.length || 0}
            </div>
          </div>

          <div className="max-h-[280px] overflow-auto border border-gray-200 rounded-lg">
            {filtered.map((g) => (
              <label key={g.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0">
                <input type="checkbox" className="h-4 w-4" checked={isChecked(g.id)} onChange={() => toggle(g.id)} />
                <span className="truncate text-gray-900">{g.name || g.id}</span>
              </label>
            ))}
            {!filtered.length && <div className="p-3 text-sm text-gray-500">Sin resultados…</div>}
          </div>

          <div className="flex justify-end mt-3">
            <button
              type="button"
              className="border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 text-sm hover:bg-gray-50
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onClick={() => setOpen(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------
// Geofence layer normalize
// -----------------------
function inferCircleFromRow(row) {
  const geo = parseMaybeJson(row?.geojson);
  const gt = String(row?.geom_type || "").toLowerCase();

  const r = toNum(row?.radius_m) ?? toNum(row?.radius) ?? toNum(row?.radio_m) ?? toNum(row?.radio) ?? null;

  let center = null;
  if (geo?.type === "Feature" && geo?.geometry?.type === "Point") center = toLatLngStrict(geo.geometry.coordinates);
  else if (geo?.type === "Point") center = toLatLngStrict(geo.coordinates);

  if (!center) {
    const lat = toNum(row?.center_lat ?? row?.lat ?? row?.latitude);
    const lng = toNum(row?.center_lng ?? row?.lng ?? row?.longitude);
    if (isValidLatLng(lat, lng)) center = [lat, lng];
  }

  const isCircle = gt.includes("circle") || (center && r && r > 0);
  if (!isCircle || !center || !r || r <= 0) return null;

  return { center, radius_m: r };
}

function buildGeofenceLayerItems(geofenceRows) {
  const items = [];
  for (const g of geofenceRows || []) {
    const polys = normalizeGeoJSONToPolygons(g.geojson);
    polys.forEach((p, idx) => items.push({ type: "polygon", geofenceId: g.id, name: g.name || g.id, positions: p, idx }));

    const circle = inferCircleFromRow(g);
    if (circle) {
      const nearZero = Math.abs(circle.center[0]) < 0.01 && Math.abs(circle.center[1]) < 0.01;
      const tiny = circle.radius_m < 300;
      if (!(nearZero && tiny)) items.push({ type: "circle", geofenceId: g.id, name: g.name || g.id, center: circle.center, radius_m: circle.radius_m, idx: "c" });
    }
  }
  return items;
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

  const [selectedGeofenceIds, setSelectedGeofenceIds] = useState([]);

  // ✅ NUEVO: permitir “mostrar todas” cuando no hay assignments
  const [showAllGeofences, setShowAllGeofences] = useState(false);

  const [diag, setDiag] = useState({
    mapCreated: false,
    w: 0,
    h: 0,
    zoom: null,
    assignmentsRows: 0,
    trackersFound: 0,
    geofencesFound: 0,
    geofencePolys: 0,
    geofenceCircles: 0,
    positionsFound: 0,
    lastAssignmentsError: null,
    lastGeofencesError: null,
    lastPositionsError: null,
    lastFromIso: null,
    lastTargetCount: 0,
    assignedGeofenceIds: 0,
    skippedZeroZero: 0,
    selectedGeofences: 0,
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
      setDiag((d) => ({
        ...d,
        lastAssignmentsError: error.message || String(error),
        assignmentsRows: 0,
        trackersFound: 0,
        assignedGeofenceIds: 0,
      }));
      setAssignments([]);
      setAssignmentTrackers([]);
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    setAssignments(rows);

    const uniqTrackers = Array.from(new Set(rows.map((r) => String(r.tracker_user_id)).filter(Boolean)))
      .map((user_id) => ({ user_id }));

    const uniqGeof = Array.from(new Set(rows.map((r) => String(r.geofence_id)).filter(Boolean)));

    setAssignmentTrackers(uniqTrackers);
    setDiag((d) => ({
      ...d,
      assignmentsRows: rows.length,
      trackersFound: uniqTrackers.length,
      assignedGeofenceIds: uniqGeof.length,
    }));
  }, [todayStrUtc]);

  const fetchGeofences = useCallback(async (currentOrgId, assignmentRows) => {
    if (!currentOrgId) return;
    setDiag((d) => ({ ...d, lastGeofencesError: null }));

    const assignedIds = Array.from(new Set((assignmentRows || []).map((r) => r?.geofence_id).filter(Boolean).map(String)));

    // ✅ caso: NO hay assignments -> si showAllGeofences, cargar todas las geocercas de la org
    const shouldLoadAll = assignedIds.length === 0 && showAllGeofences;

    if (assignedIds.length === 0 && !shouldLoadAll) {
      setGeofenceRows([]);
      setSelectedGeofenceIds([]);
      setDiag((d) => ({ ...d, geofencesFound: 0, geofencePolys: 0, geofenceCircles: 0, skippedZeroZero: 0, selectedGeofences: 0 }));
      setErrorMsg("No hay asignaciones activas en tracker_assignments para esta org.");
      return;
    }

    const q = supabase
      .from("geocercas")
      .select("id, org_id, nombre, name, geojson, geom_type, radius_m, center_lat, center_lng")
      .eq("org_id", currentOrgId);

    const { data, error } = shouldLoadAll ? await q : await q.in("id", assignedIds);

    if (error) {
      setDiag((d) => ({ ...d, lastGeofencesError: error.message || String(error), geofencesFound: 0, geofencePolys: 0, geofenceCircles: 0, skippedZeroZero: 0, selectedGeofences: 0 }));
      setGeofenceRows([]);
      setErrorMsg("Error al cargar geocercas (geocercas).");
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    let skipped = 0;

    const normalized = rows.map((r) => ({
      id: r.id,
      org_id: r.org_id,
      name: r.name || r.nombre || r.id,
      geojson: r.geojson,
      geom_type: r.geom_type || null,
      radius_m: r.radius_m ?? null,
      center_lat: r.center_lat ?? null,
      center_lng: r.center_lng ?? null,
    })).filter((r) => {
      const polys = normalizeGeoJSONToPolygons(r.geojson);
      if (!polys.length) return true; // puede ser círculo
      const b = boundsFromPolys(polys);
      const bad = isProbablyZeroZeroBounds(b);
      if (bad) skipped += 1;
      return !bad;
    });

    const polysCount = normalized.reduce((acc, g) => acc + normalizeGeoJSONToPolygons(g.geojson).length, 0);
    const circlesCount = normalized.reduce((acc, g) => acc + (inferCircleFromRow(g) ? 1 : 0), 0);

    setGeofenceRows(normalized);
    setSelectedGeofenceIds([]); // por simplicidad: “todas”

    setDiag((d) => ({
      ...d,
      geofencesFound: normalized.length,
      geofencePolys: polysCount,
      geofenceCircles: circlesCount,
      skippedZeroZero: skipped,
    }));

    setErrorMsg(shouldLoadAll ? "No hay asignaciones: mostrando TODAS las geocercas de la org (modo visual)." : "");
    setFitSignal((x) => x + 1);
  }, [showAllGeofences]);

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
          return { id: r.id, user_id: r.user_id ? String(r.user_id) : null, lat, lng, recorded_at: r.created_at, _valid: isValidLatLng(lat, lng) };
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

  const filteredGeofenceRows = useMemo(() => {
    const all = Array.isArray(geofenceRows) ? geofenceRows : [];
    if (!all.length) return [];
    if (Array.isArray(selectedGeofenceIds) && selectedGeofenceIds.length === 1 && selectedGeofenceIds[0] === "__none__") return [];
    if (!selectedGeofenceIds?.length) return all;
    const set = new Set(selectedGeofenceIds.map(String));
    return all.filter((g) => set.has(String(g.id)));
  }, [geofenceRows, selectedGeofenceIds]);

  useEffect(() => {
    setDiag((d) => ({ ...d, selectedGeofences: filteredGeofenceRows.length }));
  }, [filteredGeofenceRows]);

  const layerItems = useMemo(() => buildGeofenceLayerItems(filteredGeofenceRows), [filteredGeofenceRows]);

  const mapCenter = useMemo(() => {
    const last = positions?.[0];
    if (last && isValidLatLng(last.lat, last.lng)) return [last.lat, last.lng];
    const poly = layerItems.find((x) => x.type === "polygon" && x.positions?.length)?.positions?.[0];
    if (poly) return poly;
    const circ = layerItems.find((x) => x.type === "circle" && Array.isArray(x.center))?.center;
    if (circ) return circ;
    return [-0.22985, -78.52495];
  }, [positions, layerItems]);

  const pointsByTracker = useMemo(() => {
    const map = new Map();
    for (const p of positions || []) {
      const key = p.user_id || "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return map;
  }, [positions]);

  const Badge = ({ children }) => (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 border border-gray-200">{children}</span>
  );

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="px-3 md:px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Tracker Dashboard</h1>
            <div className="mt-1 flex flex-wrap gap-2 text-sm text-gray-600">
              <span>Org: <span className="font-mono text-gray-800">{String(orgId || "—")}</span></span>
              <Badge>assignments: {diag.assignmentsRows}</Badge>
              <Badge>geocercas: {diag.geofencesFound}</Badge>
              <Badge>polys: {diag.geofencePolys}</Badge>
              <Badge>circles: {diag.geofenceCircles}</Badge>
              <Badge>posiciones: {diag.positionsFound}</Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fetchPositions(orgId, { showSpinner: true })}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium
                         hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Cargando…" : "Actualizar"}
            </button>

            <button
              type="button"
              onClick={() => setFitSignal((x) => x + 1)}
              className="inline-flex items-center justify-center rounded-md bg-white text-gray-900 px-4 py-2 text-sm font-medium
                         border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              disabled={layerItems.length === 0}
            >
              Centrar geocerca
            </button>

            {/* ✅ botón aparece si NO hay assignments */}
            {diag.assignmentsRows === 0 && (
              <button
                type="button"
                onClick={() => setShowAllGeofences(true)}
                className="inline-flex items-center justify-center rounded-md bg-white text-gray-900 px-4 py-2 text-sm font-medium
                           border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Si no hay asignaciones activas, permite visualizar todas las geocercas de la org"
              >
                Mostrar todas (org)
              </button>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <aside className="lg:col-span-4 xl:col-span-3">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Filtros</h2>
                <p className="text-sm text-gray-600 mt-1">Selecciona ventana, tracker y geocercas a mostrar.</p>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="block text-sm font-medium text-gray-900 mb-1">Ventana</span>
                  <select
                    className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

                <label className="block">
                  <span className="block text-sm font-medium text-gray-900 mb-1">Tracker</span>
                  <select
                    className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

                <div>
                  <span className="block text-sm font-medium text-gray-900 mb-1">Geocercas</span>
                  <MultiGeofenceSelect
                    geofences={geofenceRows}
                    selectedIds={selectedGeofenceIds}
                    setSelectedIds={setSelectedGeofenceIds}
                    disabled={!geofenceRows?.length}
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Diagnóstico</h3>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                  <div><b>assignments</b>: {diag.assignmentsRows}</div>
                  <div><b>trackers</b>: {diag.trackersFound}</div>
                  <div><b>positions</b>: {diag.positionsFound}</div>
                  <div><b>geofences</b>: {diag.geofencesFound}</div>
                  <div><b>polys</b>: {diag.geofencePolys}</div>
                  <div><b>circles</b>: {diag.geofenceCircles}</div>
                  <div><b>assignedIds</b>: {diag.assignedGeofenceIds}</div>
                  <div><b>selected</b>: {diag.selectedGeofences}</div>
                </div>

                <div className="mt-2 text-[11px] text-gray-600 space-y-1">
                  <div><b>bounds</b>: <span className="font-mono">{geofenceBoundsText}</span></div>
                  <div><b>viewport</b>: <span className="font-mono">{viewportText}</span> | <b>intersects</b>: <span className="font-mono">{intersectsText}</span></div>
                </div>
              </div>
            </div>
          </aside>

          <section className="lg:col-span-8 xl:col-span-9">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">Mapa</div>
                <div className="text-xs text-gray-600">
                  {diag.mapCreated ? <span className="font-mono">map {diag.w}×{diag.h} z{diag.zoom ?? "—"}</span> : <span>Inicializando mapa…</span>}
                </div>
              </div>

              <div style={{ height: 560, minHeight: 440 }} className="relative">
                <MapContainer
                  center={mapCenter}
                  zoom={12}
                  style={{ height: "100%", width: "100%" }}
                  scrollWheelZoom
                  whenCreated={(map) => {
                    mapRef.current = map;
                    try { map.invalidateSize(); } catch {}
                  }}
                >
                  <MapDiagnostics setDiag={setDiag} />

                  <FitIfOutOfView
                    layerItems={layerItems}
                    fitSignal={fitSignal}
                    onBoundsComputed={(b) => {
                      try {
                        const sw = b.getSouthWest();
                        const ne = b.getNorthEast();
                        setGeofenceBoundsText(`SW(${sw.lat.toFixed(5)},${sw.lng.toFixed(5)}) NE(${ne.lat.toFixed(5)},${ne.lng.toFixed(5)})`);
                        const v = mapRef.current?.getBounds?.();
                        if (v?.isValid?.()) setIntersectsText(String(v.intersects(b.pad(0.05))));
                      } catch { setGeofenceBoundsText("—"); }
                    }}
                    onViewportComputed={(v) => {
                      try {
                        const sw = v.getSouthWest();
                        const ne = v.getNorthEast();
                        setViewportText(`SW(${sw.lat.toFixed(5)},${sw.lng.toFixed(5)}) NE(${ne.lat.toFixed(5)},${ne.lng.toFixed(5)})`);
                      } catch { setViewportText("—"); }
                    }}
                  />

                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
                  />

                  {layerItems.map((it) => {
                    if (it.type === "polygon") {
                      return (
                        <Polygon
                          key={`p-${it.geofenceId}-${it.idx}`}
                          positions={it.positions}
                          pathOptions={{ color: "#2563eb", weight: 4, opacity: 1, fillOpacity: 0.18 }}
                        >
                          <Tooltip sticky>{it.name}</Tooltip>
                        </Polygon>
                      );
                    }
                    if (it.type === "circle") {
                      return (
                        <Circle
                          key={`c-${it.geofenceId}-${it.idx}`}
                          center={it.center}
                          radius={it.radius_m}
                          pathOptions={{ color: "#2563eb", weight: 3, opacity: 1, fillOpacity: 0.12 }}
                        >
                          <Tooltip sticky>{it.name} (círculo)</Tooltip>
                        </Circle>
                      );
                    }
                    return null;
                  })}

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
          </section>
        </div>
      </div>
    </div>
  );
}
