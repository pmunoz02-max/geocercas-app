// src/pages/TrackerDashboard.jsx
//...
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import useOrgEntitlements from "@/hooks/useOrgEntitlements.js";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton.jsx";
import {
  boundsFromPolys,
  buildGeofenceLayerItems,
  getPositionTs,
  getTrackerKey,
  isProbablyZeroZeroBounds,
  isValidLatLng,
  mapTrackerLatestRow,
  shouldFitToBounds,
} from "./trackerDashboardHelpers";

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

const TRACKER_ANIMATION_MS = 2600;
const LARGE_JUMP_METERS = 250;
const MAX_HISTORY_PER_TRACKER = 40;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function distanceMeters(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  const p1 = L.latLng(Number(a[0]), Number(a[1]));
  const p2 = L.latLng(Number(b[0]), Number(b[1]));
  return p1.distanceTo(p2);
}

const TRACKER_COLORS = ["#2563eb", "#16a34a", "#f97316", "#dc2626", "#7c3aed", "#0d9488"];

function isValidUuid(v) {
  if (typeof v !== "string") return false;
  const value = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeUuid(v) {
  if (v === null || v === undefined) return null;
  const value = String(v).trim();
  if (!value || value.toLowerCase() === "null" || value.toLowerCase() === "undefined") return null;
  return isValidUuid(value) ? value : null;
}


function replacePositionByUserId(rows, nextRow) {
  if (!nextRow?.user_id) return Array.isArray(rows) ? rows : [];

  const currentRows = Array.isArray(rows) ? rows : [];
  const nextUserId = String(nextRow.user_id);
  const existingIndex = currentRows.findIndex((row) => String(row?.user_id || "") === nextUserId);

  if (existingIndex === -1) return [nextRow, ...currentRows];

  const updatedRows = currentRows.slice();
  updatedRows[existingIndex] = { ...updatedRows[existingIndex], ...nextRow };
  return updatedRows;
}

function formatTime(dtString) {
  if (!dtString) return "-";
  try {
    return new Date(dtString).toLocaleTimeString();
  } catch {
    return dtString;
  }
}

function getTrackerLiveStatus(row) {
  const ts = getPositionTs(row);
  if (!ts) return { status: "offline", ageSec: null };

  const ageSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));

  if (ageSec <= 120) return { status: "online", ageSec };
  if (ageSec <= 600) return { status: "stale", ageSec };
  return { status: "offline", ageSec };
}

function formatAgeShort(ageSec) {
  if (ageSec == null) return "—";
  if (ageSec < 60) return `${ageSec}s`;
  const min = Math.floor(ageSec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h`;
}

function getTrackerStatusPriority(status) {
  if (status === "offline") return 0;
  if (status === "stale") return 1;
  return 2;
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase();
}

function buildTrackerSearchText(item) {
  return [
    item?.label,
    item?.trackerLabel,
    item?.tracker_key,
    item?.trackerId,
    item?.value,
    item?.personalId,
    item?.firstName,
    item?.lastName,
    item?.fullName,
    item?.email,
    item?.latest?.tracker_label,
    item?.latest?.tracker_name,
    item?.latest?.name,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase())
    .join(" ");
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
  return row.user_id || null;
}

function resolveAssignedTrackerKey(userId, assignmentMap) {
  if (userId === null || userId === undefined) return null;
  const normalizedUserId = String(userId);
  if (!normalizedUserId) return null;
  return assignmentMap?.get(normalizedUserId) ?? normalizedUserId;
}

function resolveTrackerDisplayLabel({ row, personalById, personalByUserId }) {
  const personalId = row?.personal_id || null;
  const person = personalId ? personalById?.get(String(personalId)) : null;
  const byUser = row?.user_id ? personalByUserId?.get(String(row.user_id)) : null;
  const source = byUser || person || null;
  const fullName = [source?.nombre, source?.apellido].filter(Boolean).join(" ").trim() || null;
  const nombre = source?.nombre || null;
  const email = source?.email || null;

  return (
    fullName ||
    nombre ||
    email ||
    row?.tracker_label ||
    row?.name ||
    row?.tracker_name ||
    (row?.user_id != null ? String(row.user_id) : null) ||
    "Sin nombre"
  );
}


function isPreviewLikeHost() {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return host.includes("preview") || host === "localhost" || host === "127.0.0.1";
}

function logLiveMetric(label, payload = {}) {
  if (!isPreviewLikeHost()) return;
  console.log(`[tracker-live] ${label}`, {
    at: new Date().toISOString(),
    ...payload,
  });
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

function AnimatedTrackerDot({
  center,
  color,
  radius = 7,
  duration = TRACKER_ANIMATION_MS,
  fillOpacity = 0.9,
  strokeOpacity = 1,
  children,
}) {
  const markerRef = useRef(null);
  const frameRef = useRef(null);
  const lastCenterRef = useRef(center);

  useEffect(() => {
    const layer = markerRef.current?.instance || markerRef.current;
    if (!layer || typeof layer.setLatLng !== "function") return;
    if (!Array.isArray(center) || center.length !== 2) return;

    const next = [Number(center[0]), Number(center[1])];
    if (!Number.isFinite(next[0]) || !Number.isFinite(next[1])) return;

    const previous =
      Array.isArray(lastCenterRef.current) && lastCenterRef.current.length === 2
        ? [Number(lastCenterRef.current[0]), Number(lastCenterRef.current[1])]
        : next;

    if (!Number.isFinite(previous[0]) || !Number.isFinite(previous[1])) {
      layer.setLatLng(next);
      lastCenterRef.current = next;
      return;
    }

    const jumpMeters = distanceMeters(previous, next);
    const samePoint = previous[0] === next[0] && previous[1] === next[1];

    if (samePoint || !Number.isFinite(jumpMeters) || jumpMeters > LARGE_JUMP_METERS) {
      layer.setLatLng(next);
      lastCenterRef.current = next;
      return;
    }

    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const startTime = performance.now();

    const animate = (now) => {
      const rawT = Math.min(1, (now - startTime) / duration);
      const t = easeOutCubic(rawT);

      const lat = previous[0] + (next[0] - previous[0]) * t;
      const lng = previous[1] + (next[1] - previous[1]) * t;

      layer.setLatLng([lat, lng]);

      if (rawT < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        frameRef.current = null;
        lastCenterRef.current = next;
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [center, duration]);

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return (
    <CircleMarker
      ref={markerRef}
      center={center}
      radius={radius}
      pathOptions={{ color, fillColor: color, fillOpacity, opacity: strokeOpacity, weight: 2 }}
    >
      {children}
    </CircleMarker>
  );
}

const GeofenceLayers = React.memo(function GeofenceLayers({ layerItems, t }) {
  return (
    <>
      {layerItems.map((it) => {
        if (it.type === "polygon") {
          return (
            <Polygon
              key={`p-${it.geofenceId}-${it.idx}`}
              positions={it.positions}
              pathOptions={{ color: "#2563eb", weight: 4, opacity: 1, fillOpacity: 0.18 }}
              interactive={false}
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
              interactive={false}
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
    </>
  );
});

const TrackerLayers = React.memo(function TrackerLayers({
  allTrackerMarkers,
  selectedTrackerPath,
  personalById,
  personalByUserId,
  tOr,
  selectedTrackerId,
}) {
  const getMarkerStyleByStatus = (status, baseColor) => {
    if (status === "offline") {
      return { color: "#6b7280", radius: 6, fillOpacity: 0.45, strokeOpacity: 0.65 };
    }
    if (status === "stale") {
      return { color: baseColor, radius: 6, fillOpacity: 0.45, strokeOpacity: 0.65 };
    }
    return { color: baseColor, radius: 7, fillOpacity: 0.9, strokeOpacity: 1 };
  };

  const renderTrackerTooltip = (trackerLabel, personalId, latest, latestLat, latestLng, live) => {
    const latestLatText = Number.isFinite(latestLat) ? latestLat.toFixed(6) : "—";
    const latestLngText = Number.isFinite(latestLng) ? latestLng.toFixed(6) : "—";

    const latestTimeRaw =
      latest?.recorded_at ??
      latest?.tracker_latest_at ??
      latest?.position_at ??
      latest?.created_at ??
      null;
    const latestTimeText = latestTimeRaw ? formatTime(latestTimeRaw) : "—";

    const accuracyNum = Number(latest?.accuracy);
    const accuracyText =
      latest?.accuracy !== null && latest?.accuracy !== undefined && Number.isFinite(accuracyNum)
        ? `${accuracyNum.toFixed(0)} m`
        : null;

    const speedNum = Number(latest?.speed);
    const speedText =
      latest?.speed !== null && latest?.speed !== undefined && Number.isFinite(speedNum)
        ? speedNum.toFixed(1)
        : null;

    const status = String(live?.status || "offline");
    const ageText = formatAgeShort(live?.ageSec ?? null);

    return (
      <Tooltip direction="top" offset={[0, -8]} opacity={1}>
        <div className="text-xs">
          <div><b>{tOr("trackerDashboard.tooltip.tracker", "Tracker")}</b>: {trackerLabel}</div>
          {personalId && (
            <div><b>{tOr("trackerDashboard.tooltip.personal", "Personal")}</b>: {String(personalId)}</div>
          )}
          <div><b>{tOr("trackerDashboard.tooltip.status", "Status")}</b>: {status}</div>
          <div><b>{tOr("trackerDashboard.tooltip.lastSeen", "Last seen")}</b>: {ageText}</div>
          <div><b>{tOr("trackerDashboard.tooltip.time", "Time")}</b>: {latestTimeText}</div>
          <div><b>{tOr("trackerDashboard.tooltip.lat", "Lat")}</b>: {latestLatText}</div>
          <div><b>{tOr("trackerDashboard.tooltip.lng", "Lng")}</b>: {latestLngText}</div>
          {accuracyText && (
            <div><b>{tOr("trackerDashboard.tooltip.accuracy", "Acc")}</b>: {accuracyText}</div>
          )}
          {speedText && (
            <div><b>{tOr("trackerDashboard.tooltip.speed", "Speed")}</b>: {speedText}</div>
          )}
          {latest?.source && (
            <div><b>{tOr("trackerDashboard.tooltip.source", "Src")}</b>: {String(latest.source)}</div>
          )}
        </div>
      </Tooltip>
    );
  };

  if (selectedTrackerId === "all") {
    return (
      <>
        {(allTrackerMarkers || []).map((item) => {
          const latest = item?.latest || null;
          if (!latest) return null;

          const latestLat = Number(item?.lat);
          const latestLng = Number(item?.lng);
          if (!isValidLatLng(latestLat, latestLng)) return null;

          const live = item?.live || getTrackerLiveStatus(latest);
          const markerStyle = getMarkerStyleByStatus(live.status, item.color);
          const trackerDisplayName =
            item?.trackerLabel ||
            latest?.trackerLabel ||
            latest?.tracker_label ||
            latest?.name ||
            latest?.tracker_name ||
            item?.key;

          return (
            <AnimatedTrackerDot
              key={item.key}
              center={[latestLat, latestLng]}
              color={markerStyle.color}
              radius={markerStyle.radius}
              fillOpacity={markerStyle.fillOpacity}
              strokeOpacity={markerStyle.strokeOpacity}
            >
              {renderTrackerTooltip(trackerDisplayName, item.personalId, latest, latestLat, latestLng, live)}
            </AnimatedTrackerDot>
          );
        })}
      </>
    );
  }

  const latest = selectedTrackerPath?.latest || null;
  if (!latest) return null;

  const trackerId = getTrackerKey(latest);
  const latestLat = Number(latest?.lat);
  const latestLng = Number(latest?.lng);
  if (!isValidLatLng(latestLat, latestLng)) return null;

  const personalId = latest.personal_id || null;
  const trackerLabel =
    selectedTrackerPath?.trackerLabel ||
    latest?.trackerLabel ||
    latest?.tracker_label ||
    latest?.tracker_name ||
    latest?.name ||
    trackerId;
  const latlngs = Array.isArray(selectedTrackerPath?.latlngs) ? selectedTrackerPath.latlngs : [];
  const live = selectedTrackerPath?.live || getTrackerLiveStatus(latest);
  const markerStyle = getMarkerStyleByStatus(live.status, TRACKER_COLORS[0]);

  return (
    <>
      {latlngs.length > 1 && <Polyline positions={latlngs} pathOptions={{ color: TRACKER_COLORS[0], weight: 4, opacity: 0.95 }} smoothFactor={0} noClip={false} />}
      <AnimatedTrackerDot
        center={[latestLat, latestLng]}
        color={markerStyle.color}
        radius={markerStyle.radius}
        fillOpacity={markerStyle.fillOpacity}
        strokeOpacity={markerStyle.strokeOpacity}
      >
        {renderTrackerTooltip(trackerLabel, personalId, latest, latestLat, latestLng, live)}
      </AnimatedTrackerDot>
    </>
  );
});

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
  const positionsRef = useRef([]);
  const [loading, setLoading] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  const [timeWindowId, setTimeWindowId] = useState("6h");
  const [isHistoryRequested, setIsHistoryRequested] = useState(false);
  const [selectedTrackerId, setSelectedTrackerId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [trackerSearch, setTrackerSearch] = useState("");

  const [assignments, setAssignments] = useState([]);
  const [assignmentTrackers, setAssignmentTrackers] = useState([]);
  const [personalRows, setPersonalRows] = useState([]);
  const [positions, setPositions] = useState([]);
  const [geofenceEvents, setGeofenceEvents] = useState([]);

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

  const resolvedOrgId = normalizeUuid(orgId);

  const previewUiEnabled = useMemo(() => isPreviewLikeHost(), []);

  useEffect(() => {
    positionsRef.current = Array.isArray(positions) ? positions : [];
  }, [positions]);

  useEffect(() => {
    if (!resolvedOrgId) return;
    logLiveMetric("org_resolved", { orgId: resolvedOrgId });
  }, [resolvedOrgId]);

  const DEMO_ORG_ID = "f0f185ae-e6d1-4045-9e4b-372a5b7b471a";
  const isDemoOrg = resolvedOrgId === DEMO_ORG_ID;

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
        const v = normalizeUuid(r1.data);
        if (v) {
          setOrgId(v);
          setOrgIdSource("rpc:resolve_org_for_tracker_dashboard");
          return v;
        }
      }

      const r2 = await supabase.rpc("get_current_org_id");
      if (r2?.error) throw new Error(`get_current_org_id(): ${r2.error.message || String(r2.error)}`);
      if (!r2?.data) throw new Error("RPC returned null (no org).");

      const v = normalizeUuid(r2.data);
      if (!v) throw new Error("RPC returned invalid org id.");
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
    const safeOrgId = normalizeUuid(currentOrgId);
      if (!safeOrgId) return;

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
      .eq("org_id", safeOrgId)
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

    let source = "tracker_assignments";
    let rows = Array.isArray(data) ? data : [];

    if (rows.length === 0) {
      const asigRes = await supabase
        .from("asignaciones")
        .select("*")
        .eq("org_id", safeOrgId);

      if (!asigRes.error) {
        const asigRows = Array.isArray(asigRes.data) ? asigRes.data : [];

        const activeAsigRows = asigRows.filter((r) => {
          if (!r || r.is_deleted === true) return false;

          const start = r.start_date ? String(r.start_date).slice(0, 10) : null;
          const end = r.end_date ? String(r.end_date).slice(0, 10) : null;
          const startOk = !start || start <= todayStrUtc;
          const endOk = !end || end >= todayStrUtc;

          const hasEstado = Object.prototype.hasOwnProperty.call(r, "estado");
          const hasStatus = Object.prototype.hasOwnProperty.call(r, "status");
          let stateOk = true;

          if (hasEstado || hasStatus) {
            const estadoVal = hasEstado ? String(r.estado || "").toLowerCase() : "";
            const statusVal = hasStatus ? String(r.status || "").toLowerCase() : "";
            stateOk = estadoVal === "activa" || statusVal === "activa";
          }

          return startOk && endOk && stateOk;
        });

        rows = activeAsigRows.map((r) => ({
          id: r.id,
          geofence_id: r.geofence_id || null,
          geocerca_id: r.geocerca_id || null,
          personal_id: r.personal_id || null,
          activity_id: r.activity_id || null,
          tracker_user_id: r.tracker_user_id || r.user_id || null,
          source: "asignaciones",
        }));

        if (rows.length > 0) source = "asignaciones";
      }
    }

    console.log("[tracker-dashboard] assignments source:", source, "rows:", rows.length);

    setAssignments(rows);

    const uniqTrackers = Array.from(
      new Set(rows.map((r) => normalizeUuid(r?.tracker_user_id)).filter(Boolean))
    ).map((user_id) => ({ user_id }));
    const uniqGeof = Array.from(
      new Set(rows.map((r) => String(r.geofence_id || r.geocerca_id || "")).filter(Boolean))
    );

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
    const safeOrgId = normalizeUuid(currentOrgId);
      if (!safeOrgId) return;

    setDiag((d) => ({ ...d, lastGeofencesError: null }));
    setErrorMsg("");

    const assignedIds = Array.from(
      new Set(
        (assignmentRows || [])
          .map((r) => r?.geofence_id || r?.geocerca_id)
          .filter(Boolean)
          .map(String)
      )
    );

    let q = supabase
      .from("geofences")
      .select("id, org_id, name, geojson, lat, lng, radius_m, active, is_default")
      .eq("org_id", safeOrgId)
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
        .select("id, org_id, name, geojson, lat, lng, radius_m, active, is_default")
        .eq("org_id", safeOrgId)
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
    const safeOrgId = normalizeUuid(currentOrgId);
      if (!safeOrgId) return;
    const { data, error } = await supabase
      .from("personal")
      .select("*")
      .eq("org_id", safeOrgId)
      .order("nombre", { ascending: true });

    if (error) {
      setPersonalRows([]);
      return;
    }
    setPersonalRows(Array.isArray(data) ? data : []);
  }, []);

  async function loadLatestPositions(currentOrgId) {
    const safeOrgId = normalizeUuid(currentOrgId);
    if (!safeOrgId) {
      console.warn("[tracker-dashboard] org_id missing, skip tracker_latest query", currentOrgId);
      return { rows: [], error: null };
    }

    console.log("[tracker-dashboard] tracker_latest query org:", safeOrgId);

    const { data, error } = await supabase
      .from("tracker_latest")
      .select("user_id, org_id, lat, lng, accuracy, ts")
      .eq("org_id", safeOrgId)
      .not("lat", "is", null)
      .not("lng", "is", null);

    if (error) {
      console.warn("tracker_latest error:", error);
      return { rows: [], error };
    }

    const rows = Array.isArray(data) ? data.map(mapTrackerLatestRow).filter(Boolean) : [];

    return { rows, error: null };
  }

  async function loadLivePositionsFromPositions(currentOrgId, hoursBack) {
    const safeOrgId = normalizeUuid(currentOrgId);
    if (!safeOrgId) {
      console.warn("[tracker-dashboard] org_id missing, skip positions query", currentOrgId);
      return [];
    }

    const fromIso = new Date(Date.now() - Number(hoursBack || 6) * 60 * 60 * 1000).toISOString();
    console.log("[tracker-dashboard] positions query org:", safeOrgId);

    let query = supabase
      .from("positions")
      .select("id, user_id, lat, lng, accuracy, recorded_at, created_at")
      .eq("org_id", safeOrgId)
      .gte("recorded_at", fromIso)
      .order("recorded_at", { ascending: false, nullsFirst: false })
      .limit(500);

    if (Array.isArray(assignmentTrackers) && assignmentTrackers.length) {
      const allowedUserIds = assignmentTrackers
        .map((x) => normalizeUuid(x?.user_id))
        .filter(Boolean);
      if (allowedUserIds.length) query = query.in("user_id", allowedUserIds);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("positions live fallback error:", error);
      return [];
    }

    const mappedRows = Array.isArray(data)
      ? data.map((p) => ({
          id: p.id,
          user_id: String(p.user_id),
          lat: Number(p.lat),
          lng: Number(p.lng),
          accuracy: p.accuracy ?? null,
          recorded_at: p.recorded_at ?? p.created_at ?? null,
          source: "positions",
        }))
      : [];

    const latestByUser = new Map();
    for (const row of mappedRows) {
      if (!row?.user_id) continue;
      const key = String(row.user_id);
      const currentTs = getPositionTs(row);
      const previous = latestByUser.get(key);
      const previousTs = getPositionTs(previous);
      if (!previous || currentTs >= previousTs) latestByUser.set(key, row);
    }

    return Array.from(latestByUser.values());
  }

  const loadLatestPositionsForDashboard = useCallback(
    async (currentOrgId, options = { showSpinner: true }) => {
      const safeOrgId = normalizeUuid(currentOrgId);
      if (!safeOrgId) {
        console.warn("[tracker-dashboard] dashboard load skipped: org not resolved", currentOrgId);
        return;
      }
      const { showSpinner } = options;

      try {
        if (showSpinner) setLoading(true);
        setDiag((d) => ({ ...d, lastPositionsError: null, positionsSource: null }));
        setErrorMsg("");

        const windowConfig = TIME_WINDOWS.find((w) => w.id === timeWindowId) ?? TIME_WINDOWS[1];
        const selectedWindowHours = Math.max(1, Math.round(windowConfig.ms / (60 * 60 * 1000)));

        const latestRes = await loadLatestPositions(safeOrgId)
        const latestRows = latestRes?.rows || [];
        console.log("[tracker-dashboard] tracker_latest rows:", latestRows.length);

        let source = "tracker_latest";
        let finalRows = latestRows;

        if (latestRows.length > 0) {
          logLiveMetric("tracker_latest_used", {
            orgId: safeOrgId,
            rows: latestRows.length,
          });
        }

        if (latestRows.length === 0) {
          const fallbackRows = await loadLivePositionsFromPositions(safeOrgId, selectedWindowHours)
          console.log("[tracker-dashboard] positions live rows:", fallbackRows.length);
          logLiveMetric("fallback_positions_used", {
            orgId: safeOrgId,
            rows: fallbackRows.length,
          });
          source = "positions";
          finalRows = fallbackRows;
        }

        finalRows = (finalRows || []).filter((p) => {
          const lat = Number(p?.lat);
          const lng = Number(p?.lng);
          return p?.lat != null && p?.lng != null && !Number.isNaN(lat) && !Number.isNaN(lng);
        });

        console.log("[tracker-dashboard] final live source:", source, "rows:", finalRows.length, finalRows);

        setPositions(finalRows);
        setDiag((d) => ({ ...d, positionsFound: finalRows.length, positionsSource: source }));
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [assignmentTrackers, timeWindowId]
  );

  async function loadLatestPositionsSafe(currentOrgId) {
    const safeOrgId = normalizeUuid(currentOrgId);
    if (!safeOrgId) {
      console.warn("[tracker-dashboard] invalid org_id for tracker_latest, skipping query", currentOrgId);
      return [];
    }

    const res = await loadLatestPositions(safeOrgId);
    return res?.rows || [];
  }

  async function loadPositionsFallbackSafe(currentOrgId, hoursBack) {
    const safeOrgId = normalizeUuid(currentOrgId);
    if (!safeOrgId) {
      console.warn("[tracker-dashboard] invalid org_id for positions fallback, skipping query", currentOrgId);
      return [];
    }

    return await loadLivePositionsFromPositions(safeOrgId, hoursBack);
  }

  const fetchPositions = useCallback(
    async (currentOrgId, options = { showSpinner: true }) => {
      const safeOrgId = normalizeUuid(currentOrgId);
      if (!safeOrgId) return;
      const { showSpinner } = options;

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
            .eq("org_id", safeOrgId)
            .or(orTime)
            .order("recorded_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .limit(500);

          if (Array.isArray(assignmentTrackers) && assignmentTrackers.length) {
            const allowedUserIds = assignmentTrackers
              .map((x) => normalizeUuid(x?.user_id))
              .filter(Boolean);
            if (allowedUserIds.length) q = q.in("user_id", allowedUserIds);
          }

          return await q;
        };

        const latestRes = await loadLatestPositions(safeOrgId);
        const latestRows = latestRes?.rows || [];

        let finalRows = [];
        let tableUsed = "tracker_latest";

        if (latestRows.length > 0) {
          finalRows = latestRows;
        } else {
          tableUsed = "positions";
          let res = await queryTable("positions");

          const shouldFallbackToLegacy =
            !!res.error ||
            !Array.isArray(res.data) ||
            res.data.length === 0;

          if (shouldFallbackToLegacy) {
            const res2 = await queryTable("tracker_positions");
            tableUsed = "tracker_positions";
            res = res2;
          }

          if (!res.error && Array.isArray(res.data)) {
            finalRows = res.data.map((p) => ({
              ...p,
              user_id: p.user_id ? String(p.user_id) : p.user_id,
              recorded_at: p.recorded_at ?? p.ts ?? p.created_at ?? null,
            }));
          }
        }

        console.log("[tracker-dashboard] source:", tableUsed, "rows:", finalRows.length);
        setPositions(finalRows);
        setDiag((d) => ({ ...d, positionsFound: finalRows.length, positionsSource: tableUsed }));
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [assignmentTrackers, timeWindowId]
  );

  const fetchGeofenceEvents = useCallback(async (currentOrgId) => {
    const safeOrgId = normalizeUuid(currentOrgId);
      if (!safeOrgId) return;

    try {
      const { data, error } = await supabase
        .from("tracker_geofence_events")
        .select("id, user_id, personal_id, geocerca_nombre, event_type, lat, lng, created_at")
        .eq("org_id", safeOrgId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error loading geofence events:", error);
        setGeofenceEvents([]);
        return;
      }

      setGeofenceEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Unexpected error loading events:", e);
      setGeofenceEvents([]);
    }
  }, []);

  const reloadAllForCurrentOrg = useCallback(async (currentOrgId) => {
    const safeOrgId = normalizeUuid(currentOrgId);
      if (!safeOrgId) return;
    await Promise.all([
      fetchAssignments(currentOrgId),
      fetchPersonalCatalog(currentOrgId),
    ]);
    await fetchGeofences(currentOrgId, assignments);
    if (isHistoryRequested) {
      await fetchPositions(currentOrgId, { showSpinner: true });
    } else {
      await loadLatestPositionsForDashboard(currentOrgId, { showSpinner: true });
    }
  }, [
    assignments,
    fetchAssignments,
    fetchGeofences,
    fetchPersonalCatalog,
    fetchPositions,
    isHistoryRequested,
    loadLatestPositionsForDashboard,
  ]);

  useEffect(() => {
    if (!resolvedOrgId || entitlementsLoading || isFree) return;
    (async () => {
      await Promise.all([
        fetchAssignments(resolvedOrgId),
        fetchPersonalCatalog(resolvedOrgId),
        fetchGeofenceEvents(resolvedOrgId),
      ]);
    })();
  }, [resolvedOrgId, entitlementsLoading, isFree, fetchAssignments, fetchPersonalCatalog, fetchGeofenceEvents]);

  useEffect(() => {
    if (!resolvedOrgId || entitlementsLoading || isFree) return;
    fetchGeofences(resolvedOrgId, assignments);
  }, [resolvedOrgId, assignments, entitlementsLoading, isFree, fetchGeofences]);

  useEffect(() => {
    if (!resolvedOrgId || entitlementsLoading || isFree) return;
    if (isHistoryRequested) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setDiag((d) => ({ ...d, lastPositionsError: null, positionsSource: null }));
      setErrorMsg("");

      try {
        const windowConfig = TIME_WINDOWS.find((w) => w.id === timeWindowId) ?? TIME_WINDOWS[1];
        const selectedWindowHours = Math.max(1, Math.round(windowConfig.ms / (60 * 60 * 1000)));

        const latestRows = await loadLatestPositionsSafe(resolvedOrgId);
        console.log("[tracker-dashboard] tracker_latest rows:", latestRows.length);

        let source = "tracker_latest";
        let finalRows = latestRows;

        if (latestRows.length > 0) {
          logLiveMetric("tracker_latest_used", {
            orgId: resolvedOrgId,
            rows: latestRows.length,
          });
        }

        if (latestRows.length === 0) {
          const fallbackRows = await loadPositionsFallbackSafe(resolvedOrgId, selectedWindowHours);
          console.log("[tracker-dashboard] positions live rows:", fallbackRows.length);
          logLiveMetric("fallback_positions_used", {
            orgId: resolvedOrgId,
            rows: fallbackRows.length,
          });
          source = "positions";
          finalRows = fallbackRows;
        }

        finalRows = (finalRows || []).filter((p) => {
          const lat = Number(p?.lat);
          const lng = Number(p?.lng);
          return p?.lat != null && p?.lng != null && !Number.isNaN(lat) && !Number.isNaN(lng);
        });

        console.log("[tracker-dashboard] final live source:", source, "rows:", finalRows.length, finalRows);

        if (cancelled) return;

        setPositions(finalRows);
        setDiag((d) => ({ ...d, positionsFound: finalRows.length, positionsSource: source }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedOrgId, assignmentTrackers, entitlementsLoading, isFree, isHistoryRequested, timeWindowId]);

  useEffect(() => {
    if (!previewUiEnabled) return;
    if (!resolvedOrgId || entitlementsLoading || isFree) return;
    if (isHistoryRequested) return;

    const channel = supabase
      .channel(`tracker-dashboard-live-${resolvedOrgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tracker_latest",
          filter: `org_id=eq.${resolvedOrgId}`,
        },
        (payload) => {
          if (!payload || (payload.eventType !== "INSERT" && payload.eventType !== "UPDATE")) return;

          const eventType = payload.eventType;
          const row = payload.new;
          const mappedRow = mapTrackerLatestRow(row);
          if (!mappedRow) return;

          logLiveMetric("realtime_event", {
            eventType,
            orgId: resolvedOrgId,
            userId: String(row.user_id),
            ts: row.ts,
            source: "tracker_latest",
          });

          const prevRows = Array.isArray(positionsRef.current) ? positionsRef.current : [];
          const source = "tracker_latest";
          const nextRows = replacePositionByUserId(prevRows, mappedRow);

          logLiveMetric("state_merge", {
            source,
            rowsBefore: prevRows.length,
            rowsAfter: nextRows.length,
            userId: String(row.user_id),
          });

          positionsRef.current = nextRows;
          setPositions(nextRows);
          setDiag((d) => ({
            ...d,
            positionsFound: nextRows.length,
            positionsSource: "tracker_latest",
          }));
        }
      )
      .subscribe();

    logLiveMetric("subscription_created", { orgId: resolvedOrgId });

    return () => {
      try {
        logLiveMetric("subscription_removed", { orgId: resolvedOrgId });
        if (typeof supabase.removeChannel === "function") supabase.removeChannel(channel);
        else if (typeof channel.unsubscribe === "function") channel.unsubscribe();
      } catch {}
    };
  }, [resolvedOrgId, entitlementsLoading, isFree, isHistoryRequested, previewUiEnabled]);

  useEffect(() => {
    if (!resolvedOrgId || entitlementsLoading || isFree) return;
    if (!isHistoryRequested) return;
    fetchPositions(resolvedOrgId, { showSpinner: true });
  }, [resolvedOrgId, assignmentTrackers, timeWindowId, entitlementsLoading, isFree, isHistoryRequested, fetchPositions]);

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
      const latestTs = getPositionTs(row);
      const personalId = row.personal_id || null;
      const firstName = p?.first_name || row?.first_name || null;
      const lastName = p?.last_name || row?.last_name || null;
      const fullName = p?.full_name || p?.nombre || row?.full_name || [firstName, lastName].filter(Boolean).join(" ") || null;
      const email = p?.email || row?.email || null;
      const baseLabel = fullName || email || trackerKey;

      if (!map.has(trackerKey)) {
        const live = getTrackerLiveStatus(row);
        map.set(trackerKey, {
          key: trackerKey,
          tracker_key: trackerKey,
          user_id: row.user_id || null,
          personal_id: personalId,
          personalId,
          label: `[${String(live.status || "online").toUpperCase()}] ${baseLabel}`,
          baseLabel,
          trackerLabel: baseLabel,
          firstName,
          lastName,
          fullName,
          email,
          latest: row,
          live,
          latestTs,
          statusPriority: getTrackerStatusPriority(live.status),
        });
        continue;
      }

      const existing = map.get(trackerKey);
      if (latestTs > (existing?.latestTs ?? 0)) {
        const live = getTrackerLiveStatus(row);
        map.set(trackerKey, {
          ...existing,
          key: trackerKey,
          user_id: row.user_id || existing.user_id || null,
          personal_id: personalId || existing.personal_id || null,
          personalId: personalId || existing.personalId || null,
          label: `[${String(live.status || "online").toUpperCase()}] ${baseLabel}`,
          baseLabel,
          trackerLabel: baseLabel,
          firstName,
          lastName,
          fullName,
          email,
          latest: row,
          live,
          latestTs,
          statusPriority: getTrackerStatusPriority(live.status),
        });
      }
    }

    if (map.size === 0) {
      for (const tRow of assignmentTrackers || []) {
        const user_id = String(tRow.user_id);
        const p = personalByUserId.get(user_id) || null;
        const firstName = p?.first_name || null;
        const lastName = p?.last_name || null;
        const fullName = p?.full_name || p?.nombre || [firstName, lastName].filter(Boolean).join(" ") || null;
        const email = p?.email || null;
        const baseLabel = fullName || email || user_id;
        map.set(user_id, {
          key: user_id,
          tracker_key: user_id,
          user_id,
          personal_id: null,
          personalId: null,
          label: `[OFFLINE] ${baseLabel}`,
          baseLabel,
          trackerLabel: baseLabel,
          firstName,
          lastName,
          fullName,
          email,
          latest: null,
          live: { status: "offline", ageSec: null },
          latestTs: 0,
          statusPriority: getTrackerStatusPriority("offline"),
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const priorityDelta = (a.statusPriority ?? 2) - (b.statusPriority ?? 2);
      if (priorityDelta !== 0) return priorityDelta;

      const ageDelta = (b.live?.ageSec ?? -1) - (a.live?.ageSec ?? -1);
      if (ageDelta !== 0) return ageDelta;

      return String(a.baseLabel || a.label || "").localeCompare(String(b.baseLabel || b.label || ""));
    });
  }, [positions, assignmentTrackers, personalById, personalByUserId]);

  const searchNeedle = normalizeSearchText(trackerSearch);

  const filteredTrackerOptions = useMemo(() => {
    if (!searchNeedle) return trackersUi;

    return (trackersUi || []).filter((option) => {
      if (
        option?.value === "all" ||
        option?.tracker_key === "all" ||
        option?.trackerId === "all"
      ) {
        return true;
      }

      return buildTrackerSearchText(option).includes(searchNeedle);
    });
  }, [trackersUi, searchNeedle]);

  const visibleTrackerKeysFromSearch = useMemo(() => {
    if (!searchNeedle) return null;

    const keys = new Set();
    for (const option of filteredTrackerOptions || []) {
      const key = option?.tracker_key ?? option?.trackerId ?? option?.value ?? null;
      if (!key || key === "all") continue;
      keys.add(String(key));
    }

    return keys;
  }, [filteredTrackerOptions, searchNeedle]);

  const assignmentMap = useMemo(() => {
    const m = new Map();

    for (const a of assignments || []) {
      if (!a) continue;

      const trackerUserId = a?.tracker_user_id != null ? String(a.tracker_user_id) : null;
      if (!trackerUserId) continue;
      m.set(trackerUserId, trackerUserId);
    }

    return m;
  }, [assignments]);

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

    const searchFilteredPositions = visibleTrackerKeysFromSearch
      ? positions.filter((p) => {
          const key = getTrackerKey(p);
          return key ? visibleTrackerKeysFromSearch.has(String(key)) : false;
        })
      : positions;

    if (!searchFilteredPositions.length) return [];

    // MODE 1: All trackers → only latest position per tracker
    if (selectedTrackerId === "all") {
      const latestByTracker = new Map();

      for (const p of searchFilteredPositions) {
        const key = getTrackerKey(p);
        if (!key) continue;

        const ts = getPositionTs(p);

        const existing = latestByTracker.get(key);

        if (!existing) {
          latestByTracker.set(key, p);
          continue;
        }

        const ets = getPositionTs(existing);

        if (ts > ets) {
          latestByTracker.set(key, p);
        }
      }

      return Array.from(latestByTracker.values());
    }

    // MODE 2: Single tracker → most recent bounded history
    return searchFilteredPositions
      .filter((p) => getTrackerKey(p) === selectedTrackerId)
      .sort((a, b) => getPositionTs(a) - getPositionTs(b))
      .slice(-MAX_HISTORY_PER_TRACKER);
  }, [positions, selectedTrackerId, visibleTrackerKeysFromSearch]);

  const pointsByTracker = useMemo(() => {
    const grouped = new Map();
    for (const p of visiblePositions || []) {
      const key = getTrackerKey(p);
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(p);
    }

    const sorted = new Map();
    for (const [trackerId, rows] of grouped.entries()) {
      const trackerPositions = [...rows].sort((a, b) => getPositionTs(a) - getPositionTs(b));

      const positions = trackerPositions.slice(-MAX_HISTORY_PER_TRACKER);
      const latlngs = positions
        .map((p) => [Number(p?.lat), Number(p?.lng)])
        .filter(([lat, lng]) => isValidLatLng(lat, lng));

      const entry = {
        positions,
        latlngs,
      };
      entry.latest = entry.positions[entry.positions.length - 1] || null;

      sorted.set(trackerId, entry);
    }

    return sorted;
  }, [visiblePositions]);

  const allTrackerMarkers = useMemo(() => {
    if (selectedTrackerId !== "all") return [];

    return (visiblePositions || []).reduce((acc, row, idx) => {
      const key = getTrackerKey(row);
      if (!key) return acc;

      const lat = Number(row?.lat);
      const lng = Number(row?.lng);
      if (!isValidLatLng(lat, lng)) return acc;

      const personalId = row?.personal_id || null;
      const person = personalId ? personalById.get(String(personalId)) : null;
      const byUser = row?.user_id ? personalByUserId.get(String(row.user_id)) : null;
      const source = person || byUser || null;
      const firstName = source?.first_name || row?.first_name || null;
      const lastName = source?.last_name || row?.last_name || null;
      const fullName = source?.full_name || source?.nombre || row?.full_name || [firstName, lastName].filter(Boolean).join(" ") || null;
      const email = source?.email || row?.email || null;
      const resolvedTrackerKey = resolveAssignedTrackerKey(row?.user_id, assignmentMap) || key;
      const trackerLabel = resolveTrackerDisplayLabel({
        row,
        personalById,
        personalByUserId,
      });

      acc.push({
        key,
        tracker_key: resolvedTrackerKey,
        latest: row,
        lat,
        lng,
        personalId,
        firstName,
        lastName,
        fullName,
        email,
        trackerLabel,
        color: TRACKER_COLORS[idx % TRACKER_COLORS.length],
        live: getTrackerLiveStatus(row),
      });

      return acc;
    }, []);
  }, [selectedTrackerId, visiblePositions, personalById, personalByUserId, assignmentMap]);

  const filteredAllTrackerMarkers = useMemo(() => {
    if (selectedTrackerId !== "all") return allTrackerMarkers;
    if (statusFilter === "all") return allTrackerMarkers;

    return (allTrackerMarkers || []).filter((item) => {
      const live = item?.live || getTrackerLiveStatus(item?.latest);
      return live.status === statusFilter;
    });
  }, [allTrackerMarkers, selectedTrackerId, statusFilter]);

  const trackerStatusSummary = useMemo(() => {
    let total = 0;
    let online = 0;
    let stale = 0;
    let offline = 0;

    for (const item of allTrackerMarkers || []) {
      total += 1;
      const live = getTrackerLiveStatus(item?.latest);

      if (live.status === "online") online += 1;
      else if (live.status === "stale") stale += 1;
      else offline += 1;
    }

    return { total, online, stale, offline };
  }, [allTrackerMarkers]);

  const selectedTrackerPath = useMemo(() => {
    if (selectedTrackerId === "all") return null;

    const trackerPositions = Array.isArray(visiblePositions) ? visiblePositions : [];
    const latlngs = trackerPositions
      .map((p) => [Number(p?.lat), Number(p?.lng)])
      .filter(([lat, lng]) => isValidLatLng(lat, lng));

    const latest = trackerPositions[trackerPositions.length - 1] || null;
    const trackerKey = resolveAssignedTrackerKey(latest?.user_id, assignmentMap) || selectedTrackerId;
    const trackerLabel = latest
      ? resolveTrackerDisplayLabel({
          row: latest,
          personalById,
          personalByUserId,
        })
      : selectedTrackerId;

    return {
      positions: trackerPositions,
      latlngs,
      latest,
      tracker_key: trackerKey,
      trackerLabel,
      live: getTrackerLiveStatus(latest),
    };
  }, [selectedTrackerId, visiblePositions, assignmentMap, personalById, personalByUserId]);

  const mapZoom = useMemo(() => (isDemoOrg ? 18 : 12), [isDemoOrg]);

  const mapCenter = useMemo(() => {
    const candidates = visiblePositions?.length ? visiblePositions : positions;
    if (candidates?.length) {
      let best = null;
      let bestTs = -Infinity;
      for (const p of candidates) {
        const ts = getPositionTs(p);
        if (Number.isFinite(ts) && ts > bestTs) {
          bestTs = ts;
          best = p;
        }
      }
      if (best && isValidLatLng(best.lat, best.lng)) return [best.lat, best.lng];
    }

    const poly = layerItems.find((x) => x.type === "polygon" && x.positions?.length)?.positions?.[0];
    if (poly) return poly;
    const circ = layerItems.find((x) => x.type === "circle" && Array.isArray(x.center))?.center;
    if (circ) return circ;
    return [-0.22985, -78.52495];
  }, [visiblePositions, positions, layerItems]);

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
              onClick={() => {
                if (!resolvedOrgId) return;
                if (isHistoryRequested) fetchPositions(resolvedOrgId, { showSpinner: true });
                else loadLatestPositionsForDashboard(resolvedOrgId, { showSpinner: true });
              }}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium
                         hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              disabled={loading || !resolvedOrgId}
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
                    onChange={(e) => {
                      setTimeWindowId(e.target.value);
                      setIsHistoryRequested(true);
                    }}
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
                  <input
                    type="text"
                    className="mb-2 w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={trackerSearch}
                    onChange={(e) => setTrackerSearch(e.target.value)}
                    placeholder={tOr("trackerDashboard.labels.searchTracker", "Search tracker")}
                    disabled={!orgId}
                  />
                  <select
                    className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={selectedTrackerId}
                    onChange={(e) => setSelectedTrackerId(e.target.value)}
                    disabled={!orgId}
                  >
                    <option value="all">{tOr("trackerDashboard.labels.all", "All")}</option>
                    {filteredTrackerOptions.map((x) => (
                      <option key={x.tracker_key} value={x.tracker_key}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-sm font-medium text-gray-900 mb-1">
                    {tOr("trackerDashboard.labels.status", "Status")}
                  </span>
                  <select
                    className="w-full bg-white text-gray-900 border border-gray-300 rounded-md px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    disabled={!orgId || selectedTrackerId !== "all"}
                  >
                    <option value="all">{tOr("trackerDashboard.labels.all", "All")}</option>
                    <option value="online">{tOr("trackerDashboard.status.online", "Online")}</option>
                    <option value="stale">{tOr("trackerDashboard.status.stale", "Stale")}</option>
                    <option value="offline">{tOr("trackerDashboard.status.offline", "Offline")}</option>
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

              <div className="px-4 py-2 border-b border-gray-200 flex flex-wrap items-center gap-2">
                <Badge>{tOr("trackerDashboard.labels.total", "Total")}: {trackerStatusSummary.total}</Badge>
                <Badge>{tOr("trackerDashboard.status.online", "Online")}: {trackerStatusSummary.online}</Badge>
                <Badge>{tOr("trackerDashboard.status.stale", "Stale")}: {trackerStatusSummary.stale}</Badge>
                <Badge>{tOr("trackerDashboard.status.offline", "Offline")}: {trackerStatusSummary.offline}</Badge>
              </div>

              <div style={{ height: 560, minHeight: 440 }} className="relative">
                <div className="absolute top-3 right-3 z-[1000] rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-sm">
                  <div className="text-[11px] font-semibold text-gray-900 mb-2">
                    {tOr("trackerDashboard.sections.legend", "Legend")}
                  </div>
                  <div className="space-y-1.5 text-xs text-gray-700">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-current" style={{ background: "currentColor", opacity: 1 }} />
                      <span>{tOr("trackerDashboard.status.online", "Online")} — {tOr("trackerDashboard.legend.solidColor", "tracker color")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-current opacity-40" style={{ background: "currentColor" }} />
                      <span>{tOr("trackerDashboard.status.stale", "Stale")} — {tOr("trackerDashboard.legend.fadedColor", "faded color")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-500 bg-gray-500 opacity-60" />
                      <span>{tOr("trackerDashboard.status.offline", "Offline")} — {tOr("trackerDashboard.legend.gray", "gray")}</span>
                    </div>
                  </div>
                </div>

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

                  <GeofenceLayers layerItems={layerItems} t={t} />

                  <TrackerLayers
                    allTrackerMarkers={filteredAllTrackerMarkers}
                    selectedTrackerPath={selectedTrackerPath}
                    personalById={personalById}
                    personalByUserId={personalByUserId}
                    tOr={tOr}
                    selectedTrackerId={selectedTrackerId}
                  />
                </MapContainer>
              </div>
            </div>
          </section>

          {previewUiEnabled && isDemoOrg && geofenceEvents.length > 0 && (
            <section className="lg:col-span-8 xl:col-span-9">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200">
                  <div className="text-sm font-semibold text-gray-900">
                    {tOr("trackerDashboard.sections.recentEvents", "Recent Geofence Events")}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">
                          {tOr("trackerDashboard.events.time", "Time")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">
                          {tOr("trackerDashboard.events.tracker", "Tracker")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">
                          {tOr("trackerDashboard.events.geofence", "Geofence")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">
                          {tOr("trackerDashboard.events.type", "Event")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {geofenceEvents.slice(0, 20).map((evt) => {
                        const trackerLabel = resolveTrackerDisplayLabel({
                          row: evt,
                          personalById,
                          personalByUserId,
                        });

                        const eventColor = evt.event_type === 'ENTER' ? 'text-green-700' : 'text-red-700';
                        const eventBg = evt.event_type === 'ENTER' ? 'bg-green-50' : 'bg-red-50';

                        return (
                          <tr key={evt.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-600">
                              {evt.created_at ? new Date(evt.created_at).toLocaleTimeString() : '—'}
                            </td>
                            <td className="px-4 py-2 text-gray-900">
                              <span className="truncate">{trackerLabel}</span>
                            </td>
                            <td className="px-4 py-2 text-gray-900">
                              <span className="truncate">{evt.geocerca_nombre}</span>
                            </td>
                            <td className="px-4 py-2">
                              <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${eventBg} ${eventColor}`}>
                                {evt.event_type}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}