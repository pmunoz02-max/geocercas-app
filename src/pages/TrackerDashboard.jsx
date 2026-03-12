// src/pages/TrackerDashboard.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import useOrgEntitlements from "@/hooks/useOrgEntitlements.js";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton.jsx";

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
  { id: "1h", labelKey: "trackerDashboard.timeWindows.1h", fallback: "1 hour", ms: 1 * 60 * 60 * 1000 },
  { id: "6h", labelKey: "trackerDashboard.timeWindows.6h", fallback: "6 hours", ms: 6 * 60 * 60 * 1000 },
  { id: "12h", labelKey: "trackerDashboard.timeWindows.12h", fallback: "12 hours", ms: 12 * 60 * 60 * 1000 },
  { id: "24h", labelKey: "trackerDashboard.timeWindows.24h", fallback: "24 hours", ms: 24 * 60 * 60 * 1000 },
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

function normalizePlanLabel(planCode) {
  const v = String(planCode || "").toLowerCase();
  if (v === "pro") return "PRO";
  if (v === "enterprise") return "ENTERPRISE";
  if (v === "elite_plus") return "ELITE PLUS";
  if (v === "elite") return "ELITE";
  if (v === "starter") return "STARTER";
  if (v === "free") return "FREE";
  return v ? v.toUpperCase() : "—";
}

function resolveTrackerAuthIdFromPersonal(row) {
  if (!row) return null;
  return row.user_id || row.owner_id || row.auth_user_id || row.auth_uid || row.uid || row.user_uuid || null;
}

function parseMaybeJson(input) {
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

function getTrackerKey(row) {
  if (!row) return "unknown";
  return String(row.personal_id || row.user_id || "unknown");
}

function isPreviewLikeHost() {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return host.includes("preview") || host === "localhost" || host === "127.0.0.1";
}

// GeoJSON is [lng,lat] => Leaflet [lat,lng]
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
      try {
        map.invalidateSize();
      } catch {}
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
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      try {
        ro?.disconnect?.();
      } catch {}
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

function FitIfOutOfView({ layerItems, fitSignal, onBoundsComputed, onViewportComputed, isDemoOrg }) {
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
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: isDemoOrg ? 18 : undefined });
        lastFitSignalRef.current = fitSignal;
      }
    } catch {}
  }, [map, bounds, fitSignal, onBoundsComputed, onViewportComputed]);

  return null;
}

function pickGeometry(row) {
  return row?.geojson ?? row?.geom ?? row?.polygon ?? row?.geometry ?? null;
}

function inferCircleFromRow(row) {
  const r = toNum(row?.radius_m);
  const lat = toNum(row?.lat);
  const lng = toNum(row?.lng);
  if (!r || r <= 0) return null;
  if (!isValidLatLng(lat, lng)) return null;
  return { center: [lat, lng], radius_m: r };
}

function buildGeofenceLayerItems(geofenceRows) {
  const items = [];
  let skipped = 0;

  for (const g of geofenceRows || []) {
    const gj = pickGeometry(g);
    const polys = normalizeGeoJSONToPolygons(gj);

    if (polys.length) {
      const b = boundsFromPolys(polys);
      if (isProbablyZeroZeroBounds(b)) {
        skipped += 1;
      } else {
        polys.forEach((p, idx) =>
          items.push({ type: "polygon", geofenceId: g.id, name: g.name || g.id, positions: p, idx })
        );
      }
    }

    const circle = inferCircleFromRow(g);
    if (circle) {
      items.push({
        type: "circle",
        geofenceId: g.id,
        name: g.name || g.id,
        center: circle.center,
        radius_m: circle.radius_m,
        idx: "c",
      });
    }
  }

  return { items, skipped };
}

function MultiGeofenceSelect({ geofences, selectedIds, setSelectedIds, disabled }) {
  const { t } = useTranslation();
  const tOr = useCallback((key, fallback) => t(key, { defaultValue: fallback }), [t]);

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

  const isNoneMode = useMemo(
    () => Array.isArray(selectedIds) && selectedIds.length === 1 && selectedIds[0] === "__none__",
    [selectedIds]
  );

  const effectiveSelectedCount = useMemo(() => {
    if (!geofences?.length) return 0;
    if (isNoneMode) return 0;
    return selectedIds?.length ? selectedIds.length : geofences.length;
  }, [geofences, selectedIds, isNoneMode]);

  const label = useMemo(() => {
    if (!geofences?.length) return tOr("trackerDashboard.multiGeofence.labelBase", "Geofences");
    if (isNoneMode) return tOr("trackerDashboard.multiGeofence.labelNone", "Geofences: None");
    if (!selectedIds?.length) {
      return t("trackerDashboard.multiGeofence.labelAll", {
        count: geofences.length,
        defaultValue: `Geofences: All (${geofences.length})`,
      });
    }
    return t("trackerDashboard.multiGeofence.labelSelected", {
      count: effectiveSelectedCount,
      defaultValue: `Geofences: ${effectiveSelectedCount}`,
    });
  }, [geofences, selectedIds, effectiveSelectedCount, isNoneMode, t, tOr]);

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
              placeholder={tOr("trackerDashboard.multiGeofence.searchPlaceholder", "Search geofence…")}
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
              {tOr("trackerDashboard.multiGeofence.showAll", "Show all")}
            </button>
            <button
              type="button"
              className="border border-gray-300 bg-white text-gray-900 rounded-md px-2.5 py-1.5 text-sm hover:bg-gray-50
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onClick={setNone}
            >
              {tOr("trackerDashboard.multiGeofence.hideAll", "Hide all")}
            </button>
          </div>

          <div className="max-h-[280px] overflow-auto border border-gray-200 rounded-lg">
            {filtered.map((g) => (
              <label
                key={g.id}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
              >
                <input type="checkbox" className="h-4 w-4" checked={isChecked(g.id)} onChange={() => toggle(g.id)} />
                <span className="truncate text-gray-900">{g.name || g.id}</span>
              </label>
            ))}
            {!filtered.length && (
              <div className="p-3 text-sm text-gray-500">
                {tOr("trackerDashboard.multiGeofence.noResults", "No results…")}
              </div>
            )}
          </div>

          <div className="flex justify-end mt-3">
            <button
              type="button"
              className="border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 text-sm hover:bg-gray-50
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onClick={() => setOpen(false)}
            >
              {tOr("trackerDashboard.multiGeofence.close", "Close")}
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

  const {
    loading: entitlementsLoading,
    error: entitlementsError,
    planCode,
    isFree,
  } = useOrgEntitlements();

  const [orgId, setOrgId] = useState(null);
  const [orgIdSource, setOrgIdSource] = useState("—");
  const [orgResolveError, setOrgResolveError] = useState("");

  const mapRef = useRef(null);
  const demoTimerRef = useRef(null);
  const demoInFlightRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  // flag that indicates the live movement interval should run (preview only)
  const [demoLive, setDemoLive] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  const [timeWindowId, setTimeWindowId] = useState("6h");
  const [selectedTrackerId, setSelectedTrackerId] = useState("all");

  const [assignments, setAssignments] = useState([]);
  const [assignmentTrackers, setAssignmentTrackers] = useState([]);
  const [personalRows, setPersonalRows] = useState([]);
  const [positions, setPositions] = useState([]);

  const [geofenceRows, setGeofenceRows] = useState([]);
  const [selectedGeofenceIds, setSelectedGeofenceIds] = useState([]);

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
    positionsSource: null,
    lastAssignmentsError: null,
    lastGeofencesError: null,
    lastPositionsError: null,
    assignedGeofenceIds: 0,
    skippedZeroZero: 0,
    selectedGeofences: 0,
  });

  const [geofenceBoundsText, setGeofenceBoundsText] = useState("—");
  const [viewportText, setViewportText] = useState("—");
  const [intersectsText, setIntersectsText] = useState("—");
  const [fitSignal, setFitSignal] = useState(0);

  const previewUiEnabled = useMemo(() => isPreviewLikeHost(), []);

  const DEMO_ORG_ID = "f0f185ae-e6d1-4045-9e4b-372a5b7b471a";
  const isDemoOrg = orgId === DEMO_ORG_ID;

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  const todayStrUtc = useMemo(() => {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const resolveOrgId = useCallback(async () => {
    setOrgResolveError("");
    setErrorMsg("");
    setInfoMsg("");

    try {
      const r1 = await supabase.rpc("resolve_org_for_tracker_dashboard");
      if (r1?.error) throw new Error(`resolve_org_for_tracker_dashboard(): ${r1.error.message || String(r1.error)}`);
      if (r1?.data) {
        const v = String(r1.data);
        setOrgId(v);
        setOrgIdSource("rpc:resolve_org_for_tracker_dashboard");
        return v;
      }

      const r2 = await supabase.rpc("get_current_org_id");
      if (r2?.error) throw new Error(`get_current_org_id(): ${r2.error.message || String(r2.error)}`);
      if (!r2?.data) throw new Error("RPC returned null (no org).");

      const v = String(r2.data);
      setOrgId(v);
      setOrgIdSource("rpc:get_current_org_id");
      return v;
    } catch (e) {
      const msg = e?.message || String(e);
      setOrgId(null);
      setOrgIdSource("error");
      setOrgResolveError(msg);
      return null;
    }
  }, []);

  useEffect(() => {
    resolveOrgId();
  }, [resolveOrgId]);



  const fetchAssignments = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;

    setErrorMsg("");
    setInfoMsg("");
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
      setErrorMsg(tOr("trackerDashboard.messages.loadAssignmentsError", "Error loading assignments (tracker_assignments)."));
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    setAssignments(rows);

    const uniqTrackers = Array.from(new Set(rows.map((r) => String(r.tracker_user_id)).filter(Boolean))).map((user_id) => ({ user_id }));
    const uniqGeof = Array.from(new Set(rows.map((r) => String(r.geofence_id)).filter(Boolean)));

    setAssignmentTrackers(uniqTrackers);
    setDiag((d) => ({
      ...d,
      assignmentsRows: rows.length,
      trackersFound: uniqTrackers.length,
      assignedGeofenceIds: uniqGeof.length,
    }));

    if (rows.length === 0) {
      setInfoMsg(
        tOr(
          "trackerDashboard.messages.noActiveAssignments",
          "There are no active assignments (tracker_assignments). Showing all active geofences (the default one remains preselected)."
        )
      );
    }
  }, [todayStrUtc, tOr]);

  const fetchGeofences = useCallback(async (currentOrgId, assignmentRows) => {
    if (!currentOrgId) return;

    setDiag((d) => ({ ...d, lastGeofencesError: null }));
    setErrorMsg("");

    const assignedIds = Array.from(
      new Set((assignmentRows || []).map((r) => r?.geofence_id).filter(Boolean).map(String))
    );

    let q = supabase
      .from("geofences")
      .select("id, org_id, name, geojson, geom, lat, lng, radius_m, active, is_default")
      .eq("org_id", currentOrgId)
      .eq("active", true);

    if (assignedIds.length > 0) {
      q = q.in("id", assignedIds);
    } else {
      q = q
        .order("is_default", { ascending: false })
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });
    }

    const res = await q;

    if (res.error) {
      setDiag((d) => ({
        ...d,
        lastGeofencesError: res.error.message || String(res.error),
        geofencesFound: 0,
        geofencePolys: 0,
        geofenceCircles: 0,
        skippedZeroZero: 0,
        selectedGeofences: 0,
      }));
      setGeofenceRows([]);
      setSelectedGeofenceIds([]);
      setErrorMsg(tOr("trackerDashboard.messages.loadGeofencesError", "Error loading geofences (geofences)."));
      return;
    }

    let rows = Array.isArray(res.data) ? res.data : [];

    let pickedFallbackFirstActive = false;
    if (assignedIds.length === 0 && rows.length === 0) {
      const fb = await supabase
        .from("geofences")
        .select("id, org_id, name, geojson, geom, lat, lng, radius_m, active, is_default")
        .eq("org_id", currentOrgId)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (!fb.error && Array.isArray(fb.data) && fb.data.length > 0) {
        rows = fb.data;
        pickedFallbackFirstActive = true;
      }
    }

    const normalized = rows
      .filter((r) => r.active === true)
      .map((r) => ({
        id: r.id,
        org_id: r.org_id,
        name: r.name || r.id,
        geojson: r.geojson,
        geom: r.geom,
        lat: r.lat,
        lng: r.lng,
        radius_m: r.radius_m,
        is_default: r.is_default,
      }));

    const { items, skipped } = buildGeofenceLayerItems(normalized);
    const polysCount = items.filter((x) => x.type === "polygon").length;
    const circlesCount = items.filter((x) => x.type === "circle").length;

    setGeofenceRows(normalized);

    if (assignedIds.length === 0) {
      const defaultIds = normalized.filter((g) => g.is_default === true).map((g) => String(g.id));
      setSelectedGeofenceIds(defaultIds.length ? defaultIds : []);
    } else {
      setSelectedGeofenceIds([]);
    }

    setDiag((d) => ({
      ...d,
      geofencesFound: normalized.length,
      geofencePolys: polysCount,
      geofenceCircles: circlesCount,
      skippedZeroZero: skipped,
    }));

    if (normalized.length === 0) {
      if (assignedIds.length > 0) {
        setInfoMsg(
          t("trackerDashboard.messages.noActiveGeofencesForAssignments", {
            orgId: currentOrgId,
            defaultValue: `There are assignments, but there are no active geofences for those assignments in org (${currentOrgId}).`,
          })
        );
      } else if (pickedFallbackFirstActive) {
        setInfoMsg(
          tOr(
            "trackerDashboard.messages.fallbackGeofenceShown",
            "No active geofences were found; 1 active geofence was shown as a fallback so the dashboard does not remain empty."
          )
        );
      } else {
        setInfoMsg(
          t("trackerDashboard.messages.noActiveGeofencesForOrg", {
            orgId: currentOrgId,
            defaultValue: `There are no active geofences available for this org (${currentOrgId}).`,
          })
        );
      }
    }

    setFitSignal((x) => x + 1);
  }, [t, tOr]);

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

  const fetchPositions = useCallback(
    async (currentOrgId, options = { showSpinner: true, isDemo: false }) => {
      if (!currentOrgId) return;
      const { showSpinner, isDemo } = options;

      try {
        if (showSpinner) setLoading(true);
        setDiag((d) => ({ ...d, lastPositionsError: null, positionsSource: null }));
        setErrorMsg("");

        const windowConfig = TIME_WINDOWS.find((w) => w.id === timeWindowId) ?? TIME_WINDOWS[1];
        const fromIso = new Date(Date.now() - windowConfig.ms).toISOString();

        const selectCols =
          "id, org_id, user_id, personal_id, asignacion_id, lat, lng, accuracy, speed, heading, battery, is_mock, source, recorded_at, created_at";

        const orTime =
          `recorded_at.gte.${fromIso},and(recorded_at.is.null,created_at.gte.${fromIso})`;

        const queryTable = async (tableName) => {
          let q = supabase
            .from(tableName)
            .select(selectCols)
            .eq("org_id", currentOrgId)
            .or(orTime)
            .order("recorded_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .limit(500);

          if (Array.isArray(assignmentTrackers) && assignmentTrackers.length) {
            const allowedUserIds = assignmentTrackers.map((x) => x.user_id).filter(Boolean);
            if (allowedUserIds.length) q = q.in("user_id", allowedUserIds);
          }

          return await q;
        };

        let tableUsed = "positions";
        let res = await queryTable("positions");

        const shouldFallback =
          !!res.error ||
          (Array.isArray(res.data) && res.data.length === 0);

        if (shouldFallback) {
          const res2 = await queryTable("tracker_positions");
          if (!res2.error) {
            tableUsed = "tracker_positions";
            res = res2;
          } else {
            const e1 = res.error?.message || String(res.error || "");
            const e2 = res2.error?.message || String(res2.error || "");
            res = { data: null, error: new Error(`positions: ${e1}; tracker_positions: ${e2}`) };
            tableUsed = "positions";
          }
        }

        const { data, error } = res;

        if (error) {
          setDiag((d) => ({
            ...d,
            lastPositionsError: error.message || String(error),
            positionsFound: 0,
            positionsSource: tableUsed,
          }));
          setPositions([]);
          setErrorMsg(tOr("trackerDashboard.messages.loadPositionsError", "Error loading positions."));
          return;
        }

        const normalized = (data || [])
          .map((r) => {
            const lat = toNum(r.lat);
            const lng = toNum(r.lng);
            const ts = r.recorded_at || r.created_at || null;
            return {
              id: r.id,
              org_id: r.org_id ? String(r.org_id) : null,
              user_id: r.user_id ? String(r.user_id) : null,
              personal_id: r.personal_id ? String(r.personal_id) : null,
              asignacion_id: r.asignacion_id ? String(r.asignacion_id) : null,
              lat,
              lng,
              recorded_at: ts,
              created_at: r.created_at || null,
              accuracy: r.accuracy ?? null,
              speed: r.speed ?? null,
              heading: r.heading ?? null,
              battery: r.battery ?? null,
              is_mock: r.is_mock ?? null,
              source: r.source ?? null,
              tracker_key: getTrackerKey(r),
              _valid: isValidLatLng(lat, lng),
            };
          })
          .filter((p) => p._valid);

        if (!isDemo) {
          setPositions(normalized);
          setDiag((d) => ({ ...d, positionsFound: normalized.length, positionsSource: tableUsed }));
        } else {
          // In demo mode, keep only the latest position per tracker
          const m = new Map();
          for (const p of normalized) {
            const key = getTrackerKey(p);
            if (!m.has(key)) m.set(key, p);
          }
          const reducedPositions = Array.from(m.values());
          setPositions(reducedPositions);
          setDiag((d) => ({ ...d, positionsFound: reducedPositions.length, positionsSource: tableUsed }));
        }
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [assignmentTrackers, timeWindowId, tOr]
  );

  const reloadAllForCurrentOrg = useCallback(async (currentOrgId) => {
    if (!currentOrgId) return;
    await Promise.all([
      fetchAssignments(currentOrgId),
      fetchPersonalCatalog(currentOrgId),
    ]);
    await fetchGeofences(currentOrgId, assignments);
    await fetchPositions(currentOrgId, { showSpinner: true });
  }, [assignments, fetchAssignments, fetchGeofences, fetchPersonalCatalog, fetchPositions]);

  const onLoadDemo = useCallback(async () => {
    if (!previewUiEnabled) {
      setErrorMsg("DEMO loader available only in preview/localhost.");
      return;
    }
    if (!orgId) {
      setErrorMsg("No active org resolved.");
      return;
    }

    setLoadingDemo(true);
    setErrorMsg("");
    setInfoMsg("");

    try {
      const r = await supabase.rpc("load_demo_preview_dataset", { p_org_id: orgId });

      if (r?.error) {
        throw new Error(r.error.message || String(r.error));
      }

      await resolveOrgId();
      await Promise.all([fetchAssignments(orgId), fetchPersonalCatalog(orgId)]);
      await fetchGeofences(orgId, assignments);
      await fetchPositions(orgId, { showSpinner: true, isDemo: true });

      setSelectedTrackerId("all");
      setInfoMsg(tOr("trackerDashboard.messages.demoLoaded", "DEMO dataset loaded successfully."));
      setFitSignal((x) => x + 1);
      // start live demo movement once data is in place
      if (demoTimerRef.current) {
        clearInterval(demoTimerRef.current);
        demoTimerRef.current = null;
      }
      demoInFlightRef.current = false;
      setDemoLive(true);
    } catch (e) {
      const msg = e?.message || String(e);
      setErrorMsg(`DEMO loader error: ${msg}`);
    } finally {
      setLoadingDemo(false);
    }
  }, [previewUiEnabled, orgId, resolveOrgId, fetchAssignments, fetchPersonalCatalog, fetchGeofences, fetchPositions, assignments, tOr]);

  useEffect(() => {
    // limpiar cualquier timer anterior antes de decidir si crear uno nuevo
    if (demoTimerRef.current) {
      clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    demoInFlightRef.current = false;

    if (!orgId || !previewUiEnabled || !isDemoOrg || !demoLive) {
      return;
    }

    const tick = async () => {
      if (demoInFlightRef.current) return;
      demoInFlightRef.current = true;

      try {
        const { error } = await supabase.rpc("demo_move_trackers");

        if (error) {
          console.error("demo_move_trackers failed:", error);
          setDemoLive(false);

          if (demoTimerRef.current) {
            clearInterval(demoTimerRef.current);
            demoTimerRef.current = null;
          }
          return;
        }

        await fetchPositions(orgId, { showSpinner: false, isDemo: true });
      } catch (err) {
        console.error("demo move unexpected error:", err);
        setDemoLive(false);

        if (demoTimerRef.current) {
          clearInterval(demoTimerRef.current);
          demoTimerRef.current = null;
        }
      } finally {
        demoInFlightRef.current = false;
      }
    };

    // primer tick inmediato
    tick();

    // luego intervalo único (6 segundos para caminata humana lenta y grabación de pantalla)
    demoTimerRef.current = setInterval(tick, 6000);

    return () => {
      if (demoTimerRef.current) {
        clearInterval(demoTimerRef.current);
        demoTimerRef.current = null;
      }
      demoInFlightRef.current = false;
    };
  }, [orgId, previewUiEnabled, isDemoOrg, demoLive, fetchPositions]);

  useEffect(() => {
    if (!orgId || entitlementsLoading || isFree) return;
    (async () => {
      await Promise.all([fetchAssignments(orgId), fetchPersonalCatalog(orgId)]);
    })();
  }, [orgId, entitlementsLoading, isFree, fetchAssignments, fetchPersonalCatalog]);

  useEffect(() => {
    if (!orgId || entitlementsLoading || isFree) return;
    fetchGeofences(orgId, assignments);
  }, [orgId, assignments, entitlementsLoading, isFree, fetchGeofences]);

  useEffect(() => {
    if (!orgId || entitlementsLoading || isFree) return;
    fetchPositions(orgId, { showSpinner: true });
  }, [orgId, assignmentTrackers, timeWindowId, entitlementsLoading, isFree, fetchPositions]);

  const personalByUserId = useMemo(() => {
    const m = new Map();
    (personalRows || []).forEach((p) => {
      const uid = resolveTrackerAuthIdFromPersonal(p);
      if (uid) m.set(String(uid), p);
    });
    return m;
  }, [personalRows]);

  const personalById = useMemo(() => {
    const m = new Map();
    (personalRows || []).forEach((p) => {
      if (p?.id) m.set(String(p.id), p);
    });
    return m;
  }, [personalRows]);

  const trackersUi = useMemo(() => {
    const map = new Map();

    for (const row of positions || []) {
      const trackerKey = getTrackerKey(row);
      const person = row.personal_id ? personalById.get(String(row.personal_id)) : null;
      const byUser = row.user_id ? personalByUserId.get(String(row.user_id)) : null;
      const p = person || byUser || null;

      if (!map.has(trackerKey)) {
        map.set(trackerKey, {
          tracker_key: trackerKey,
          user_id: row.user_id || null,
          personal_id: row.personal_id || null,
          label: p?.nombre || p?.email || trackerKey,
        });
      }
    }

    if (map.size === 0) {
      for (const tRow of assignmentTrackers || []) {
        const user_id = String(tRow.user_id);
        const p = personalByUserId.get(user_id) || null;
        map.set(user_id, {
          tracker_key: user_id,
          user_id,
          personal_id: null,
          label: p?.nombre || p?.email || user_id,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
  }, [positions, assignmentTrackers, personalById, personalByUserId]);

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

  useEffect(() => {
    if (selectedTrackerId === "all") return;
    const exists = trackersUi.some((x) => x.tracker_key === selectedTrackerId);
    if (!exists) setSelectedTrackerId("all");
  }, [selectedTrackerId, trackersUi]);

  useEffect(() => {
    setDiag((d) => ({
      ...d,
      trackersFound: trackersUi.length,
    }));
  }, [trackersUi]);

  const { items: layerItems } = useMemo(() => buildGeofenceLayerItems(filteredGeofenceRows), [filteredGeofenceRows]);

  const visiblePositions = useMemo(() => {
    if (!positions?.length) return [];

    // In demo mode, positions are already reduced to one per tracker in fetchPositions
    if (isDemoOrg) {
      return positions || [];
    }

    if (selectedTrackerId === "all") return positions || [];
    return (positions || []).filter((p) => getTrackerKey(p) === selectedTrackerId);
  }, [positions, selectedTrackerId, isDemoOrg]);

  const mapZoom = useMemo(() => (isDemoOrg ? 18 : 12), [isDemoOrg]);

  const mapCenter = useMemo(() => {
    const last = visiblePositions?.[0] || positions?.[0];
    if (last && isValidLatLng(last.lat, last.lng)) return [last.lat, last.lng];
    const poly = layerItems.find((x) => x.type === "polygon" && x.positions?.length)?.positions?.[0];
    if (poly) return poly;
    const circ = layerItems.find((x) => x.type === "circle" && Array.isArray(x.center))?.center;
    if (circ) return circ;
    return [-0.22985, -78.52495];
  }, [visiblePositions, positions, layerItems, isDemoOrg]);

  const pointsByTracker = useMemo(() => {
    const map = new Map();
    for (const p of visiblePositions || []) {
      const key = getTrackerKey(p);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return map;
  }, [visiblePositions]);

  const Badge = ({ children }) => (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 border border-gray-200">{children}</span>
  );

  const effectiveOrgText = orgId ? String(orgId) : "—";
  const trackerBlockedByPlan = !entitlementsLoading && isFree;

  if (entitlementsLoading) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-50">
        <div className="px-3 md:px-6 py-6 max-w-3xl">
          <h1 className="text-2xl font-semibold text-gray-900">
            {tOr("trackerDashboard.title", "Tracker Dashboard")}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {tOr("trackerDashboard.states.validatingPlan", "Validating organization plan...")}
          </p>
        </div>
      </div>
    );
  }

  if (entitlementsError) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-50">
        <div className="px-3 md:px-6 py-6 max-w-3xl">
          <h1 className="text-2xl font-semibold text-gray-900">
            {tOr("trackerDashboard.title", "Tracker Dashboard")}
          </h1>
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-amber-900">
            <div className="font-semibold">
              {tOr("trackerDashboard.states.planValidationFailed", "The organization plan could not be validated.")}
            </div>
            <div className="mt-2 text-sm break-all">{entitlementsError}</div>
          </div>
        </div>
      </div>
    );
  }

  if (trackerBlockedByPlan) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-50">
        <div className="px-3 md:px-6 py-6 max-w-3xl space-y-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {tOr("trackerDashboard.title", "Tracker Dashboard")}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {tOr("trackerDashboard.states.moduleUnavailable", "This module is not available on the organization's current plan.")}
            </p>
          </div>

          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-amber-900">
            <div className="text-base font-semibold">
              {tOr("trackerDashboard.states.requiresPro", "The tracking dashboard requires PRO or higher.")}
            </div>
            <div className="mt-2 text-sm">
              {tOr("trackerDashboard.labels.detectedPlan", "Detected plan")}{" "}
              <span className="font-semibold">{normalizePlanLabel(planCode)}</span>
            </div>
            <div className="mt-1 text-sm">
              {tOr("trackerDashboard.labels.activeOrg", "Active org")}{" "}
              <span className="font-mono">{effectiveOrgText}</span>
            </div>
            <div className="mt-3 text-sm">
              {tOr("trackerDashboard.states.upgradeHint", "Upgrade to visualize positions, routes and geofences from this panel.")}
            </div>
          </div>

          {orgId ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm text-gray-700 mb-3">
                {tOr("trackerDashboard.states.upgradeOrgPrompt", "Upgrade this organization to enable Tracker Dashboard.")}
              </div>
              <UpgradeToProButton
                orgId={orgId}
                getAccessToken={getAccessToken}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="px-3 md:px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {tOr("trackerDashboard.title", "Tracker Dashboard")}
            </h1>

            <div className="mt-1 flex flex-wrap gap-2 text-sm text-gray-600">
              <span>
                {tOr("trackerDashboard.labels.activeOrgDebug", "Org (Active)")}{" "}
                <span className="font-mono text-gray-800">{effectiveOrgText}</span>{" "}
                <span className="text-xs text-gray-500">[{orgIdSource}]</span>
              </span>

              <Badge>{tOr("trackerDashboard.badges.assignments", "assignments")}: {diag.assignmentsRows}</Badge>
              <Badge>{tOr("trackerDashboard.badges.geofences", "geofences")}: {diag.geofencesFound}</Badge>
              <Badge>{tOr("trackerDashboard.badges.polys", "polys")}: {diag.geofencePolys}</Badge>
              <Badge>{tOr("trackerDashboard.badges.circles", "circles")}: {diag.geofenceCircles}</Badge>
              <Badge>{tOr("trackerDashboard.badges.positions", "positions")}: {diag.positionsFound}</Badge>
              {diag.positionsSource && <Badge>{tOr("trackerDashboard.badges.source", "src")}: {diag.positionsSource}</Badge>}
              {previewUiEnabled && <Badge>preview-demo-ui</Badge>}
            </div>

            {orgResolveError && (
              <div className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {tOr("trackerDashboard.messages.orgResolveError", "Error resolving org")}{" "}
                <span className="font-mono">{orgResolveError}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {previewUiEnabled && (
              <button
                type="button"
                onClick={onLoadDemo}
                className="inline-flex items-center justify-center rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium
                           hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                disabled={loadingDemo || loading || !orgId}
              >
                {loadingDemo ? "Cargando DEMO…" : "Cargar DEMO"}
              </button>
            )}

            <button
              type="button"
              onClick={() => resolveOrgId()}
              className="inline-flex items-center justify-center rounded-md bg-white text-gray-900 px-4 py-2 text-sm font-medium
                         border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            >
              {tOr("trackerDashboard.actions.resolveOrgAgain", "Resolve org again (RPC)")}
            </button>

            <button
              type="button"
              onClick={() => orgId && fetchPositions(orgId, { showSpinner: true })}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium
                         hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              disabled={loading || !orgId}
            >
              {loading
                ? tOr("trackerDashboard.actions.loading", "Loading…")
                : tOr("trackerDashboard.actions.refresh", "Refresh")}
            </button>

            <button
              type="button"
              onClick={() => setFitSignal((x) => x + 1)}
              className="inline-flex items-center justify-center rounded-md bg-white text-gray-900 px-4 py-2 text-sm font-medium
                         border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              disabled={layerItems.length === 0}
            >
              {tOr("trackerDashboard.actions.centerGeofence", "Center geofence")}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {errorMsg}
          </div>
        )}

        {infoMsg && !errorMsg && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
            {infoMsg}
          </div>
        )}

        {!orgId && !orgResolveError && (
          <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm">
            {tOr("trackerDashboard.states.resolvingActiveOrg", "Resolving active organization…")}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <aside className="lg:col-span-4 xl:col-span-3">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {tOr("trackerDashboard.sections.filters", "Filters")}
                </h2>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="block text-sm font-medium text-gray-900 mb-1">
                    {tOr("trackerDashboard.labels.window", "Window")}
                  </span>
                  <select
                    className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={timeWindowId}
                    onChange={(e) => setTimeWindowId(e.target.value)}
                    disabled={!orgId}
                  >
                    {TIME_WINDOWS.map((w) => (
                      <option key={w.id} value={w.id}>
                        {tOr(w.labelKey, w.fallback)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-sm font-medium text-gray-900 mb-1">
                    {tOr("trackerDashboard.labels.tracker", "Tracker")}
                  </span>
                  <select
                    className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={selectedTrackerId}
                    onChange={(e) => setSelectedTrackerId(e.target.value)}
                    disabled={!orgId}
                  >
                    <option value="all">{tOr("trackerDashboard.labels.all", "All")}</option>
                    {trackersUi.map((x) => (
                      <option key={x.tracker_key} value={x.tracker_key}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <span className="block text-sm font-medium text-gray-900 mb-1">
                    {tOr("trackerDashboard.labels.geofences", "Geofences")}
                  </span>
                  <MultiGeofenceSelect
                    geofences={geofenceRows.map((g) => ({ id: g.id, name: g.name }))}
                    selectedIds={selectedGeofenceIds}
                    setSelectedIds={setSelectedGeofenceIds}
                    disabled={!orgId || !geofenceRows?.length}
                  />
                  {!geofenceRows?.length && (
                    <div className="mt-1 text-xs text-gray-500">
                      {tOr(
                        "trackerDashboard.messages.noVisibleGeofences",
                        "There are no active/visible geofences available for this org (or you do not have permission to view them)."
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  {tOr("trackerDashboard.sections.diagnostics", "Diagnostics")}
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                  <div><b>{tOr("trackerDashboard.badges.assignments", "assignments")}</b>: {diag.assignmentsRows}</div>
                  <div><b>{tOr("trackerDashboard.badges.trackers", "trackers")}</b>: {diag.trackersFound}</div>
                  <div><b>{tOr("trackerDashboard.badges.positions", "positions")}</b>: {diag.positionsFound}</div>
                  <div><b>{tOr("trackerDashboard.badges.geofences", "geofences")}</b>: {diag.geofencesFound}</div>
                  <div><b>{tOr("trackerDashboard.badges.polys", "polys")}</b>: {diag.geofencePolys}</div>
                  <div><b>{tOr("trackerDashboard.badges.circles", "circles")}</b>: {diag.geofenceCircles}</div>
                  <div><b>{tOr("trackerDashboard.badges.assignedIds", "assignedIds")}</b>: {diag.assignedGeofenceIds}</div>
                  <div><b>{tOr("trackerDashboard.badges.selected", "selected")}</b>: {diag.selectedGeofences}</div>
                </div>

                <div className="mt-2 text-[11px] text-gray-600 space-y-1">
                  <div>
                    <b>{tOr("trackerDashboard.badges.bounds", "bounds")}</b>{" "}
                    <span className="font-mono">{geofenceBoundsText}</span>
                  </div>
                  <div>
                    <b>{tOr("trackerDashboard.badges.viewport", "viewport")}</b>{" "}
                    <span className="font-mono">{viewportText}</span>
                    {" | "}
                    <b>{tOr("trackerDashboard.badges.intersects", "intersects")}</b>{" "}
                    <span className="font-mono">{intersectsText}</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <section className="lg:col-span-8 xl:col-span-9">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">
                  {tOr("trackerDashboard.sections.map", "Map")}
                </div>
                <div className="text-xs text-gray-600">
                  {diag.mapCreated ? (
                    <span className="font-mono">
                      {tOr("trackerDashboard.map.statusPrefix", "map")} {diag.w}×{diag.h} z{diag.zoom ?? "—"}
                    </span>
                  ) : (
                    <span>{tOr("trackerDashboard.map.initializing", "Initializing map…")}</span>
                  )}
                </div>
              </div>

              <div style={{ height: 560, minHeight: 440 }} className="relative">
                <MapContainer
                  center={mapCenter}
                  zoom={mapZoom}
                  style={{ height: "100%", width: "100%" }}
                  scrollWheelZoom
                  whenCreated={(map) => {
                    mapRef.current = map;
                    try {
                      map.invalidateSize();
                    } catch {}
                  }}
                >
                  <MapDiagnostics setDiag={setDiag} />

                  <FitIfOutOfView
                    layerItems={layerItems}
                    fitSignal={fitSignal}
                    isDemoOrg={isDemoOrg}
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
                      } catch {
                        setViewportText("—");
                      }
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
                          <Tooltip sticky>
                            {t("trackerDashboard.map.circleLabel", {
                              name: it.name,
                              defaultValue: `${it.name} (circle)`,
                            })}
                          </Tooltip>
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

                    const person = latest.personal_id ? personalById.get(String(latest.personal_id)) : null;
                    const byUser = latest.user_id ? personalByUserId.get(String(latest.user_id)) : null;
                    const trackerLabel = person?.nombre || person?.email || byUser?.nombre || byUser?.email || trackerId;

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
                              <div><b>{tOr("trackerDashboard.tooltip.tracker", "Tracker")}</b>: {trackerLabel}</div>
                              <div><b>{tOr("trackerDashboard.tooltip.time", "Time")}</b>: {formatTime(latest.recorded_at)}</div>
                              <div><b>{tOr("trackerDashboard.tooltip.lat", "Lat")}</b>: {latest.lat.toFixed(6)}</div>
                              <div><b>{tOr("trackerDashboard.tooltip.lng", "Lng")}</b>: {latest.lng.toFixed(6)}</div>
                              {latest.accuracy !== null && latest.accuracy !== undefined && (
                                <div>
                                  <b>{tOr("trackerDashboard.tooltip.accuracy", "Acc")}</b>:{" "}
                                  {Number(latest.accuracy).toFixed?.(0) ?? String(latest.accuracy)} m
                                </div>
                              )}
                              {latest.speed !== null && latest.speed !== undefined && (
                                <div>
                                  <b>{tOr("trackerDashboard.tooltip.speed", "Speed")}</b>:{" "}
                                  {Number(latest.speed).toFixed?.(1) ?? String(latest.speed)}
                                </div>
                              )}
                              {latest.source && (
                                <div>
                                  <b>{tOr("trackerDashboard.tooltip.source", "Src")}</b>:{" "}
                                  {String(latest.source)}
                                </div>
                              )}
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