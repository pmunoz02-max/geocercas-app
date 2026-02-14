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

// GeoJSON siempre es [lng,lat] => Leaflet [lat,lng]
function toLatLngStrict(coord) {
  if (!coord || !Array.isArray(coord) || coord.length < 2) return null;
  const lng = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

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

// Heurística SOLO para descartar basura 0,0 (no para invertir coords)
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

function FitIfOutOfView({ geofencePolygons, fitSignal, onBoundsComputed, onViewportComputed }) {
  const map = useMap();
  const lastFitSignalRef = useRef(0);

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

        setTimeout(() => {
          try {
            const v2 = map.getBounds?.();
            if (v2?.isValid?.()) onViewportComputed?.(v2);
          } catch {}
        }, 50);
      }
    } catch {}
  }, [map, bounds, fitSignal, onBoundsComputed, onViewportComputed]);

  return null;
}

/** =========================
 * MultiSelect Geocercas UI
 * ========================= */
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

  const isNoneMode = useMemo(() => {
    return Array.isArray(selectedIds) && selectedIds.length === 1 && selectedIds[0] === "__none__";
  }, [selectedIds]);

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

      // si estaba en modo NONE, al marcar una geocerca salimos de NONE y dejamos solo esa
      if (arr.length === 1 && arr[0] === "__none__") {
        return [sid];
      }

      // si estaba en "Todas" (arr vacío), expandimos a todas menos la que desmarcamos
      if (arr.length === 0) {
        const all = (geofences || []).map((g) => String(g.id));
        return all.filter((x) => x !== sid);
      }

      const set = new Set(arr);
      if (set.has(sid)) set.delete(sid);
      else set.add(sid);

      const next = Array.from(set);

      // si quedó vacío, volvemos a "todas"
      return next.length ? next : [];
    });
  };

  const setAll = () => setSelectedIds([]); // vacío = Todas
  const setNone = () => setSelectedIds(["__none__"]); // sentinel para "ninguna"

  // cerrar al hacer click afuera
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
    if (!selectedIds?.length) return true; // Todas
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
        title={disabled ? "No hay geocercas" : "Seleccionar geocercas"}
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
              title="Seleccionar todas"
            >
              Mostrar todas
            </button>
            <button
              type="button"
              className="border border-gray-300 bg-white text-gray-900 rounded-md px-2.5 py-1.5 text-sm hover:bg-gray-50
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onClick={setNone}
              title="Quitar todas"
            >
              Ocultar todas
            </button>

            <div className="ml-auto text-xs text-gray-500">
              {filtered.length}/{geofences?.length || 0}
            </div>
          </div>

          <div className="max-h-[280px] overflow-auto border border-gray-200 rounded-lg">
            {filtered.map((g) => (
              <label
                key={g.id}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={isChecked(g.id)}
                  onChange={() => toggle(g.id)}
                />
                <span className="truncate text-gray-900">{g.name || g.id}</span>
                <span className="ml-auto text-xs text-gray-400 font-mono truncate max-w-[140px]">
                  {String(g.id).slice(0, 8)}
                </span>
              </label>
            ))}

            {!filtered.length && (
              <div className="p-3 text-sm text-gray-500">Sin resultados…</div>
            )}
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

  // ✅ selección multi de geocercas (vacío = "todas", ["__none__"] = ninguna)
  const [selectedGeofenceIds, setSelectedGeofenceIds] = useState([]);

  const [geoDbg, setGeoDbg] = useState({
    rows: 0,
    firstType: null,
    geomType: null,
    parseOk: null,
    polysComputed: 0,
  });

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

    const geofenceIds = Array.from(new Set((assignmentRows || []).map((r) => r?.geofence_id).filter(Boolean).map(String)));

    if (!geofenceIds.length) {
      setGeofenceRows([]);
      setGeoDbg({ rows: 0, firstType: null, geomType: null, parseOk: null, polysComputed: 0 });
      setDiag((d) => ({ ...d, geofencesFound: 0, geofencePolys: 0, skippedZeroZero: 0, selectedGeofences: 0 }));
      setSelectedGeofenceIds([]); // reset a "todas" (pero no hay)
      setErrorMsg("No hay geocercas asignadas (tracker_assignments.geofence_id).");
      return;
    }

    let data = null;
    let error = null;

    // intento #1
    {
      const res = await supabase
        .from("v_geofences_ui")
        .select("id, org_id, name, geojson, geom_type")
        .eq("org_id", currentOrgId)
        .in("id", geofenceIds);

      data = res.data;
      error = res.error;
    }

    // fallback #2
    if (error) {
      const res2 = await supabase
        .from("v_geocercas_tracker_ui")
        .select("id, org_id, name, geojson, geom_type")
        .eq("org_id", currentOrgId)
        .in("id", geofenceIds);

      data = res2.data;
      error = res2.error;
    }

    if (error) {
      setDiag((d) => ({
        ...d,
        lastGeofencesError: error.message || String(error),
        geofencesFound: 0,
        geofencePolys: 0,
        skippedZeroZero: 0,
        selectedGeofences: 0,
      }));
      setGeofenceRows([]);
      setGeoDbg({ rows: 0, firstType: null, geomType: null, parseOk: false, polysComputed: 0 });
      setErrorMsg("Error al cargar geocercas (vista UI).");
      return;
    }

    const rows = Array.isArray(data) ? data : [];

    // Filtra geocercas corruptas cerca de 0,0
    let skipped = 0;
    const filtered = rows.filter((r) => {
      const polys = normalizeGeoJSONToPolygons(r.geojson);
      const b = boundsFromPolys(polys);
      const bad = isProbablyZeroZeroBounds(b);
      if (bad) skipped += 1;
      return !bad;
    });

    const normalized = filtered.map((r) => ({
      id: r.id,
      name: r.name || r.id,
      geojson: r.geojson,
      geom_type: r.geom_type || null,
    }));

    const polysCount = normalized.reduce((acc, g) => acc + normalizeGeoJSONToPolygons(g.geojson).length, 0);

    setGeofenceRows(normalized);

    // recortar selección previa
    setSelectedGeofenceIds((prev) => {
      const arr = Array.isArray(prev) ? prev.map(String) : [];
      if (arr.length === 1 && arr[0] === "__none__") return ["__none__"];
      if (arr.length === 0) return []; // "todas"
      const allowed = new Set(normalized.map((g) => String(g.id)));
      const next = arr.filter((id) => allowed.has(String(id)));
      return next.length ? next : [];
    });

    setDiag((d) => ({
      ...d,
      geofencesFound: normalized.length,
      geofencePolys: polysCount,
      skippedZeroZero: skipped,
    }));

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

    if (!normalized.length) {
      setErrorMsg("No hay geocercas visibles: o están inactivas, o solo existe la corrupta (0,0), o no hay asignaciones válidas.");
      return;
    }

    setErrorMsg("");
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

  const filteredGeofenceRows = useMemo(() => {
    const all = Array.isArray(geofenceRows) ? geofenceRows : [];
    if (!all.length) return [];
    if (Array.isArray(selectedGeofenceIds) && selectedGeofenceIds.length === 1 && selectedGeofenceIds[0] === "__none__") {
      return [];
    }
    if (!selectedGeofenceIds?.length) return all;
    const set = new Set(selectedGeofenceIds.map(String));
    return all.filter((g) => set.has(String(g.id)));
  }, [geofenceRows, selectedGeofenceIds]);

  useEffect(() => {
    const cnt = filteredGeofenceRows.length;
    setDiag((d) => ({ ...d, selectedGeofences: cnt }));
  }, [filteredGeofenceRows]);

  const geofencePolygons = useMemo(() => {
    const out = [];
    for (const g of filteredGeofenceRows || []) {
      const polys = normalizeGeoJSONToPolygons(g.geojson);
      polys.forEach((p, i) => out.push({ geofenceId: g.id, name: g.name || g.id, positions: p, idx: i }));
    }
    return out;
  }, [filteredGeofenceRows]);

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

  const Badge = ({ children }) => (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 border border-gray-200">
      {children}
    </span>
  );

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="px-3 md:px-6 py-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Tracker Dashboard</h1>
            <div className="mt-1 flex flex-wrap gap-2 text-sm text-gray-600">
              <span>
                Org: <span className="font-mono text-gray-800">{String(orgId || "—")}</span>
              </span>
              <Badge>geocercas: {diag.geofencesFound}</Badge>
              <Badge>polys: {diag.geofencePolys}</Badge>
              <Badge>posiciones: {diag.positionsFound}</Badge>
              <Badge>seleccionadas: {diag.selectedGeofences}</Badge>
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
              disabled={geofencePolygons.length === 0}
              title={geofencePolygons.length === 0 ? "No hay geocercas seleccionadas para centrar" : "Centrar geocerca(s) seleccionada(s)"}
            >
              Centrar geocerca
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
            {errorMsg}
          </div>
        )}

        {/* Layout: Sidebar + Map */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Sidebar */}
          <aside className="lg:col-span-4 xl:col-span-3">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Filtros</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Selecciona ventana, tracker y geocercas a mostrar.
                </p>
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
                  <div className="mt-2 text-xs text-gray-600">
                    Tip: “Mostrar todas” y “Ocultar todas” están dentro del selector.
                  </div>
                </div>
              </div>

              {/* Diagnostics (visible pero ordenado) */}
              <div className="pt-3 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Diagnóstico</h3>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                  <div><b>assignments</b>: {diag.assignmentsRows}</div>
                  <div><b>trackers</b>: {diag.trackersFound}</div>
                  <div><b>positions</b>: {diag.positionsFound}</div>
                  <div><b>geofences</b>: {diag.geofencesFound}</div>
                  <div><b>polys</b>: {diag.geofencePolys}</div>
                  <div><b>assignedIds</b>: {diag.assignedGeofenceIds}</div>
                  <div><b>selected</b>: {diag.selectedGeofences}</div>
                  <div><b>skipped(0,0)</b>: {diag.skippedZeroZero}</div>
                </div>

                <div className="mt-2 text-[11px] text-gray-600 space-y-1">
                  <div><b>fromIso</b>: <span className="font-mono">{diag.lastFromIso || "—"}</span></div>
                  <div><b>bounds</b>: <span className="font-mono">{geofenceBoundsText}</span></div>
                  <div><b>viewport</b>: <span className="font-mono">{viewportText}</span> | <b>intersects</b>: <span className="font-mono">{intersectsText}</span></div>
                  <div><b>geoDbg</b>: rows={geoDbg.rows} geom_type={String(geoDbg.geomType)} geojson_type={String(geoDbg.firstType)} polys(first)={geoDbg.polysComputed}</div>
                  <div><b>errors</b>: assign={diag.lastAssignmentsError || "—"} | geo={diag.lastGeofencesError || "—"} | pos={diag.lastPositionsError || "—"}</div>
                </div>
              </div>
            </div>
          </aside>

          {/* Map */}
          <section className="lg:col-span-8 xl:col-span-9">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">Mapa</div>
                <div className="text-xs text-gray-600">
                  {diag.mapCreated ? (
                    <span className="font-mono">map {diag.w}×{diag.h} z{diag.zoom ?? "—"}</span>
                  ) : (
                    <span>Inicializando mapa…</span>
                  )}
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
                  whenReady={() => {
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
                        setGeofenceBoundsText(`SW(${sw.lat.toFixed(5)},${sw.lng.toFixed(5)}) NE(${ne.lat.toFixed(5)},${ne.lng.toFixed(5)})`);

                        const v = mapRef.current?.getBounds?.();
                        if (v?.isValid?.()) setIntersectsText(String(v.intersects(b.pad(0.05))));
                      } catch {
                        setGeofenceBoundsText("—");
                      }
                    }}
                    onViewportComputed={(v) => {
                      try {
                        const sw = v.getSouthWest();
                        const ne = v.getNorthEast();
                        setViewportText(`SW(${sw.lat.toFixed(5)},${sw.lng.toFixed(5)}) NE(${ne.lat.toFixed(5)},${ne.lng.toFixed(5)})`);

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
                      pathOptions={{ color: "#2563eb", weight: 4, opacity: 1, fillOpacity: 0.18 }}
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
          </section>
        </div>
      </div>
    </div>
  );
}
