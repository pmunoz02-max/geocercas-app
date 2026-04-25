// Devuelve el nombre amigable del tracker según prioridad solicitada
// Nombre amigable de tracker según prioridad estricta
function getFriendlyTrackerName(tracker) {
  return (
    tracker?.display_name ||
    tracker?.name ||
    tracker?.personal?.full_name ||
    tracker?.profile?.full_name ||
    tracker?.email ||
    (isValidUuid(tracker?.user_id) ? undefined : tracker?.user_id) ||
    tracker?.user_id ||
    "(sin nombre)"
  );
}
// src/pages/TrackerDashboard.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import { supabase } from "../lib/supabaseClient";
import useOrgEntitlements from "@/hooks/useOrgEntitlements.js";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton";
import {
  buildGeofenceLayerItems,
  getPositionTs,
  getTrackerKey,
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
  useMapEvents,
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

function isRpcFunctionNotFound(error) {
  if (!error) return false;
  const details = [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .map((part) => String(part).toLowerCase())
    .join(" ");
  return details.includes("not found") || details.includes("could not find the function");
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
    return new Date(dtString).toLocaleString();
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




function isProbablyZeroZeroBounds(bounds) {
  try {
    if (!bounds?.isValid?.()) return false;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const vals = [sw?.lat, sw?.lng, ne?.lat, ne?.lng].map(Number);
    return vals.every((v) => Number.isFinite(v) && Math.abs(v) < 0.000001);
  } catch {
    return false;
  }
}

function logLiveMetric() {
  // no-op in production UI
}

// Removed preview/debug helpers


function FitIfOutOfView({ layerItems, markerPoints, fitSignal, onBoundsComputed, onViewportComputed, isDemoOrg }) {
  const map = useMap();
  const lastFitSignalRef = useRef(0);

  const bounds = useMemo(() => {
    try {
      const geofencePts = [];
      (layerItems || []).forEach((it) => {
        if (it.type === "polygon") (it.positions || []).forEach((p) => geofencePts.push(p));
        else if (it.type === "circle") {
          if (Array.isArray(it.center) && it.center.length >= 2) geofencePts.push(it.center);
        }
      });

      const markerPts = [];
      (markerPoints || []).forEach((p) => {
        if (Array.isArray(p) && p.length >= 2) {
          const lat = Number(p[0]);
          const lng = Number(p[1]);
          if (isValidLatLng(lat, lng)) markerPts.push([lat, lng]);
        }
      });

      const geofenceBounds = geofencePts.length > 0 ? L.latLngBounds(geofencePts) : null;
      const markerBounds = markerPts.length > 0 ? L.latLngBounds(markerPts) : null;

      const geofenceValid = !!(geofenceBounds?.isValid?.() && !isProbablyZeroZeroBounds(geofenceBounds));
      const markerValid = !!(markerBounds?.isValid?.());

      if (geofenceValid) return geofenceBounds;
      if (markerValid) return markerBounds;
      return null;
    } catch {
      return null;
    }
  }, [layerItems, markerPoints]);

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



function CursorCoordinatesOverlay({ onChange, onScaleChange }) {
  const map = useMapEvents({
    zoomend() {
      try {
        const size = map?.getSize?.();
        if (!size) {
          onScaleChange?.("—");
          return;
        }

        const y = Math.round(size.y / 2);
        const start = map.containerPointToLatLng([Math.round(size.x / 2), y]);
        const end = map.containerPointToLatLng([Math.round(size.x / 2) + 100, y]);
        const rawMeters = start.distanceTo(end);

        if (!Number.isFinite(rawMeters) || rawMeters <= 0) {
          onScaleChange?.("—");
          return;
        }

        const niceSteps = [1, 2, 5];
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawMeters)));
        let niceMeters = magnitude;
        for (const step of niceSteps) {
          const candidate = step * magnitude;
          if (candidate <= rawMeters) niceMeters = candidate;
        }

        const label = niceMeters >= 1000
          ? `${niceMeters % 1000 === 0 ? Math.round(niceMeters / 1000) : (niceMeters / 1000).toFixed(1)} km`
          : `${Math.round(niceMeters)} m`;

        onScaleChange?.(label.replace(/\.0\s+km$/, " km"));
      } catch {
        onScaleChange?.("—");
      }
    },
    moveend() {
      try {
        const size = map?.getSize?.();
        if (!size) {
          onScaleChange?.("—");
          return;
        }

        const y = Math.round(size.y / 2);
        const start = map.containerPointToLatLng([Math.round(size.x / 2), y]);
        const end = map.containerPointToLatLng([Math.round(size.x / 2) + 100, y]);
        const rawMeters = start.distanceTo(end);

        if (!Number.isFinite(rawMeters) || rawMeters <= 0) {
          onScaleChange?.("—");
          return;
        }

        const niceSteps = [1, 2, 5];
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawMeters)));
        let niceMeters = magnitude;
        for (const step of niceSteps) {
          const candidate = step * magnitude;
          if (candidate <= rawMeters) niceMeters = candidate;
        }

        const label = niceMeters >= 1000
          ? `${niceMeters % 1000 === 0 ? Math.round(niceMeters / 1000) : (niceMeters / 1000).toFixed(1)} km`
          : `${Math.round(niceMeters)} m`;

        onScaleChange?.(label.replace(/\.0\s+km$/, " km"));
      } catch {
        onScaleChange?.("—");
      }
      try {
        const center = map?.getCenter?.();
        const zoom = map?.getZoom?.() ?? null;
        onChange?.({ lat: center?.lat ?? null, lng: center?.lng ?? null, zoom });
      } catch {}
    },
    mousemove(e) {
      try {
        const lat = e?.latlng?.lat;
        const lng = e?.latlng?.lng;
        const zoom = map?.getZoom?.() ?? null;
        onChange?.({ lat, lng, zoom });
      } catch {}
    },
  });

  useEffect(() => {
    try {
      const center = map?.getCenter?.();
      const zoom = map?.getZoom?.() ?? null;
      onChange?.({ lat: center?.lat ?? null, lng: center?.lng ?? null, zoom });
      const size = map?.getSize?.();
      if (!size) {
        onScaleChange?.("—");
        return;
      }
      const y = Math.round(size.y / 2);
      const start = map.containerPointToLatLng([Math.round(size.x / 2), y]);
      const end = map.containerPointToLatLng([Math.round(size.x / 2) + 100, y]);
      const rawMeters = start.distanceTo(end);
      if (!Number.isFinite(rawMeters) || rawMeters <= 0) {
        onScaleChange?.("—");
        return;
      }
      const niceSteps = [1, 2, 5];
      const magnitude = Math.pow(10, Math.floor(Math.log10(rawMeters)));
      let niceMeters = magnitude;
      for (const step of niceSteps) {
        const candidate = step * magnitude;
        if (candidate <= rawMeters) niceMeters = candidate;
      }
      const label = niceMeters >= 1000
        ? `${niceMeters % 1000 === 0 ? Math.round(niceMeters / 1000) : (niceMeters / 1000).toFixed(1)} km`
        : `${Math.round(niceMeters)} m`;
      onScaleChange?.(label.replace(/\.0\s+km$/, " km"));
    } catch {}
  }, [map, onChange, onScaleChange]);

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
      return { color: baseColor, radius: 6, fillOpacity: 0.65, strokeOpacity: 0.8 };
    }
    return { color: baseColor, radius: 7, fillOpacity: 0.9, strokeOpacity: 1 };
  };

  const renderTrackerTooltip = (item, latest, latestLat, latestLng, live) => {
    const latestLatText = Number.isFinite(latestLat) ? latestLat.toFixed(6) : "—";
    const latestLngText = Number.isFinite(latestLng) ? latestLng.toFixed(6) : "—";

    const latestTimeRaw = getPositionTs(latest) || null;
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

    const trackerName = getFriendlyTrackerName(item);
    return (
      <Tooltip direction="top" offset={[0, -8]} opacity={1}>
        <div className="text-xs">
          <div><b>{tOr("trackerDashboard.tooltip.tracker", "Tracker")}</b>: {getFriendlyTrackerName(item)}</div>
          {item?.personalId && (
            <div><b>{tOr("trackerDashboard.tooltip.personal", "Personal")}</b>: {String(item.personalId)}</div>
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

  // Use allTrackerMarkers (derived from trackersUi) for the "all trackers" view.
  if (selectedTrackerId === "all") {
    return (
      <>
        {(allTrackerMarkers || []).map((item) => {
          const latest = item?.latest || null;
          const latestLat = Number(item?.lat);
          const latestLng = Number(item?.lng);
          if (!item?.hasValidCoords || !isValidLatLng(latestLat, latestLng)) return null;

          const live = item?.live || { status: "offline", ageSec: null };
          const markerStyle = getMarkerStyleByStatus(live.status, item.color);

          return (
            <AnimatedTrackerDot
              key={item.key}
              center={[latestLat, latestLng]}
              color={markerStyle.color}
              radius={markerStyle.radius}
              fillOpacity={markerStyle.fillOpacity}
              strokeOpacity={markerStyle.strokeOpacity}
            >
              {renderTrackerTooltip(item, latest, latestLat, latestLng, live)}
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
  const person = personalId ? personalById.get(String(personalId)) : null;
  const byUser = latest.user_id ? personalByUserId.get(String(latest.user_id)) : null;
  const trackerLabel =
    getFriendlyTrackerName({
      display_name: latest?.display_name,
      name: latest?.name,
      personal: person,
      profile: byUser,
      email: latest?.email || person?.email || byUser?.email,
      user_id: trackerId,
    });
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
        {renderTrackerTooltip(
          {
            display_name: latest?.display_name || trackerLabel,
            name: latest?.name || trackerLabel,
            personal: person,
            profile: byUser,
            email: latest?.email || person?.email || byUser?.email,
            user_id: trackerId,
          },
          latest,
          latestLat,
          latestLng,
          live
        )}
      </AnimatedTrackerDot>
    </>
  );
});

export default function TrackerDashboard() {
  const { t } = useTranslation();
  const { activeOrgId, refreshSession } = useAuth();
  const tOr = useCallback((key, fallback) => t(key, { defaultValue: fallback }), [t]);
  const getStatusLabel = (status) => {
    try {
      const safeStatus = String(status || "offline").toLowerCase();
      return typeof t === "function"
        ? t(`status.${safeStatus}`, { defaultValue: safeStatus })
        : safeStatus;
    } catch {
      return status || "offline";
    }
  };

  const {
    loading: entitlementsLoading,
    error: entitlementsError,
    planCode,
    isFree,
  } = useOrgEntitlements();

  const orgId = activeOrgId || null;
  const orgIdSource = "auth.activeOrgId";
  const orgResolveError =
    orgId && !normalizeUuid(orgId)
      ? tOr("trackerDashboard.messages.invalidOrgInSession", "Invalid active organization in session.")
      : "";

  const mapRef = useRef(null);
  const positionsRef = useRef([]);
  const [loading, setLoading] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [geofenceBoundsText, setGeofenceBoundsText] = useState("—");
  const [intersectsText, setIntersectsText] = useState("—");
  const [diag, setDiag] = useState({
    mapCreated: false,
    w: null,
    h: null,
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

  const [timeWindowId, setTimeWindowId] = useState("6h");
  const [isHistoryRequested, setIsHistoryRequested] = useState(false);
  const [selectedTrackerId, setSelectedTrackerId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [trackerSearch, setTrackerSearch] = useState("");

  const [assignments, setAssignments] = useState([]);
  const [assignmentTrackers, setAssignmentTrackers] = useState([]);
  const [personalRows, setPersonalRows] = useState([]);
  const [trackerStatusRows, setTrackerStatusRows] = useState([]);
  const [trackerCounts, setTrackerCounts] = useState(null);
  const [positions, setPositions] = useState([]);
  const [geofenceEvents, setGeofenceEvents] = useState([]);

  const [geofenceRows, setGeofenceRows] = useState([]);
  const [selectedGeofenceIds, setSelectedGeofenceIds] = useState([]);

  const [cursorCoords, setCursorCoords] = useState({ lat: null, lng: null, zoom: null });
  const [scaleLabel, setScaleLabel] = useState("—");
  const [fitSignal, setFitSignal] = useState(0);

  const resolvedOrgId = normalizeUuid(orgId);

  const activeTrackerUserIds = useMemo(() => {
    return new Set(
      (latestRows || [])
        .map((r) => r?.user_id)
        .filter(Boolean)
        .map(String)
    );
  }, [latestRows]);


  useEffect(() => {
    positionsRef.current = Array.isArray(positions) ? positions : [];
  }, [positions]);

  useEffect(() => {
    setAssignments([]);
    setAssignmentTrackers([]);
    setPersonalRows([]);
    setTrackerStatusRows([]);
    setTrackerCounts(null);
    setPositions([]);
    positionsRef.current = [];
    setGeofenceEvents([]);
    setGeofenceRows([]);
    setSelectedGeofenceIds([]);
    setSelectedTrackerId("all");
    setTrackerSearch("");
    setStatusFilter("all");
    // setInfoMsg removed (diagnostic only)
    setErrorMsg("");
    setDiag((d) => ({
      ...d,
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
    }));
  }, [resolvedOrgId]);

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

  const fetchAssignments = useCallback(async (currentOrgId) => {
    const safeOrgId = normalizeUuid(currentOrgId);
      if (!safeOrgId) return;

    setErrorMsg("");
    // setInfoMsg removed (diagnostic only)
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

    // No active assignments: previously setInfoMsg for diagnostics (removed)
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
      .from("tracker_latest_app")
      .select(`
        user_id,
        lat,
        lng,
        accuracy,
        ts,
        created_at,
        source
      `)
      .eq("org_id", safeOrgId)
      .not("lat", "is", null)
      .not("lng", "is", null);

    if (error) {
      console.warn("tracker_latest_app error:", error);
      return { rows: [], error };
    }

    console.log("[tracker-dashboard] tracker_latest_app RAW:", data);

    const rows = Array.isArray(data)
      ? data
          .map((row) => {
            const mapped = mapTrackerLatestRow(row);
            if (!mapped) return null;
            return {
              ...mapped,
              user_id: row?.user_id ? String(row.user_id) : mapped.user_id,
              lat: row?.lat ?? mapped.lat,
              lng: row?.lng ?? mapped.lng,
              accuracy: row?.accuracy ?? mapped.accuracy ?? null,
              recorded_at:
                row?.ts ??
                row?.created_at ??
                mapped.recorded_at ??
                null,
              ts:
                row?.ts ??
                row?.created_at ??
                mapped.ts ??
                null,
              device_recorded_at: row?.device_recorded_at ?? mapped.device_recorded_at ?? null,
              created_at: row?.created_at ?? mapped.created_at ?? null,
              source: row?.source ?? mapped.source ?? null,
              speed: row?.speed ?? mapped.speed ?? null,
              heading: row?.heading ?? mapped.heading ?? null,
              battery: row?.battery ?? mapped.battery ?? null,
              is_mock: row?.is_mock ?? mapped.is_mock ?? null,
              latest: {
                user_id: row?.user_id ? String(row.user_id) : mapped.user_id,
                lat: row?.lat ?? mapped.lat,
                lng: row?.lng ?? mapped.lng,
                accuracy: row?.accuracy ?? mapped.accuracy ?? null,
                recorded_at:
                  row?.ts ??
                  row?.created_at ??
                  mapped.recorded_at ??
                  null,
                ts:
                  row?.ts ??
                  row?.created_at ??
                  mapped.ts ??
                  null,
                device_recorded_at: row?.device_recorded_at ?? mapped.device_recorded_at ?? null,
                created_at: row?.created_at ?? mapped.created_at ?? null,
                source: row?.source ?? mapped.source ?? null,
                speed: row?.speed ?? mapped.speed ?? null,
                heading: row?.heading ?? mapped.heading ?? null,
                battery: row?.battery ?? mapped.battery ?? null,
                is_mock: row?.is_mock ?? mapped.is_mock ?? null,
              },
            };
          })
          .filter(Boolean)
      : [];

    return { rows, error: null };
  }

  // Assignment filtering removed; use activeTrackerUserIds as needed


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
          latest: {
            user_id: String(p.user_id),
            lat: Number(p.lat),
            lng: Number(p.lng),
            accuracy: p.accuracy ?? null,
            recorded_at: p.recorded_at ?? p.created_at ?? null,
            source: "positions",
          },
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


  const fetchDashboardData = useCallback(
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

        const statusRes = await supabase.rpc("rpc_tracker_dashboard_status", {
          p_org_id: safeOrgId,
        });

        const trackerStatusRows = Array.isArray(statusRes.data) ? statusRes.data : [];

        if (statusRes.error) {
          console.error("[tracker-dashboard] rpc_tracker_dashboard_status error:", statusRes.error);
          setErrorMsg("Error loading tracker dashboard status.");
          setTrackerStatusRows([]);
          setTrackerCounts(null);
        } else {
          setTrackerStatusRows(trackerStatusRows);
        }

        const countsRes = await supabase.rpc("rpc_tracker_dashboard_counts", {
          p_org_id: safeOrgId,
        });

        if (countsRes.error) {
          console.warn("[tracker-dashboard] rpc not available, using fallback");

          const localCounts = Array.isArray(statusRes.data)
            ? statusRes.data.reduce(
                (acc, row) => {
                  const s = String(row?.status || "").toLowerCase();
                  acc.total += 1;
                  if (s === "online") acc.online += 1;
                  else if (s === "stale") acc.stale += 1;
                  else acc.offline += 1;
                  return acc;
                },
                { total: 0, online: 0, stale: 0, offline: 0 }
              )
            : null;

          setTrackerCounts(localCounts);
        } else {
          const countsRow =
            Array.isArray(countsRes.data) && countsRes.data.length > 0
              ? countsRes.data[0]
              : null;

          setTrackerCounts(countsRow);
        }

        const windowConfig = TIME_WINDOWS.find((w) => w.id === timeWindowId) ?? TIME_WINDOWS[1];
        const selectedWindowHours = Math.max(1, Math.round(windowConfig.ms / (60 * 60 * 1000)));

        const latestRes = await loadLatestPositions(safeOrgId);
        let latestRows = latestRes?.rows || [];


        let source = "tracker_latest_app";
        let finalRows = latestRows;

        console.log("[tracker-dashboard] allowedAssignmentUserIds:", allowedAssignmentUserIds);
        console.log("[tracker-dashboard] latestRows after filter:", latestRows);

        if (latestRows.length === 0) {
          finalRows = await loadLivePositionsFromPositions(safeOrgId, selectedWindowHours);
          source = "positions";
        }

        finalRows = (finalRows || []).filter((p) => {
          const lat = Number(p?.lat ?? p?.latest?.lat);
          const lng = Number(p?.lng ?? p?.latest?.lng);
          return !Number.isNaN(lat) && !Number.isNaN(lng) && isValidLatLng(lat, lng);
        });

        setPositions(finalRows);
        setDiag((d) => ({ ...d, positionsFound: finalRows.length, positionsSource: source }));
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [timeWindowId, allowedAssignmentUserIds]
  );



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

        const latestRes = await loadLatestPositions(safeOrgId);
        let latestRows = latestRes?.rows || [];


        console.log("[tracker-dashboard] tracker_latest_app rows:", latestRows.length);

        let source = "tracker_latest_app";
        let finalRows = latestRows;

        if (latestRows.length > 0) {
          logLiveMetric("tracker_latest_app_used", {
            orgId: safeOrgId,
            rows: latestRows.length,
          });
        }

        let fallbackRows = null;

        if (latestRows.length === 0) {
          fallbackRows = await loadLivePositionsFromPositions(safeOrgId, selectedWindowHours);
          console.log("[tracker-dashboard] positions live rows:", fallbackRows.length);
          logLiveMetric("fallback_positions_used", {
            orgId: safeOrgId,
            rows: fallbackRows.length,
          });
          source = "positions";
          finalRows = fallbackRows;
        }

        finalRows = (finalRows || []).filter((p) => {
          const lat = Number(p?.lat ?? p?.latest?.lat);
          const lng = Number(p?.lng ?? p?.latest?.lng);
          return !Number.isNaN(lat) && !Number.isNaN(lng) && isValidLatLng(lat, lng);
        });

        console.log("[tracker-dashboard] final live source:", source, "rows:", finalRows.length, finalRows);

        console.log("[dashboard] latestRows raw:", latestRows);
        if (fallbackRows) console.log("[dashboard] fallbackRows raw:", fallbackRows);
        console.log("[dashboard] finalRows raw:", finalRows);
        console.log(
          "[dashboard] finalRows summary:",
          (finalRows || []).map((r) => ({
            user_id: r?.user_id,
            lat: r?.lat,
            lng: r?.lng,
            recorded_at: r?.recorded_at,
            ts: r?.ts,
            latest_lat: r?.latest?.lat,
            latest_lng: r?.latest?.lng,
            latest_recorded_at: r?.latest?.recorded_at,
            latest_ts: r?.latest?.ts,
            source: r?.source,
            latest_source: r?.latest?.source,
          }))
        );

        setPositions(finalRows);
        setDiag((d) => ({ ...d, positionsFound: finalRows.length, positionsSource: source }));
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [assignmentTrackers, timeWindowId, allowedAssignmentUserIds]
  );


  async function loadLatestPositionsSafe(currentOrgId) {
    const safeOrgId = normalizeUuid(currentOrgId);
    if (!safeOrgId) {
      console.warn("[tracker-dashboard] invalid org_id for tracker_latest_app, skipping query", currentOrgId);
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


          return await q;
        };

        const latestRes = await loadLatestPositions(safeOrgId);
        let latestRows = latestRes?.rows || [];


        let finalRows = [];
        let tableUsed = "tracker_latest_app";

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
              latest: {
                user_id: p.user_id ? String(p.user_id) : p.user_id,
                lat: p.lat,
                lng: p.lng,
                accuracy: p.accuracy ?? null,
                recorded_at: p.recorded_at ?? p.ts ?? p.created_at ?? null,
                source: p.source ?? null,
                speed: p.speed ?? null,
                heading: p.heading ?? null,
                battery: p.battery ?? null,
                is_mock: p.is_mock ?? null,
              },
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
    [assignmentTrackers, timeWindowId, allowedAssignmentUserIds]
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
      await fetchDashboardData(resolvedOrgId, { showSpinner: true });
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedOrgId, entitlementsLoading, isFree, isHistoryRequested, fetchDashboardData]);

  // Removed preview/debug live subscription effect

  useEffect(() => {
    if (!resolvedOrgId || entitlementsLoading || isFree) return;
    if (!isHistoryRequested) return;
    fetchPositions(resolvedOrgId, { showSpinner: true });
  }, [resolvedOrgId, assignmentTrackers, timeWindowId, entitlementsLoading, isFree, isHistoryRequested, fetchPositions]);


  useEffect(() => {
    if (!resolvedOrgId || entitlementsLoading || isFree || isHistoryRequested) return;

    console.log("[dashboard] polling started", resolvedOrgId);

    let isActive = true;

    const tick = async () => {
      if (!isActive) return;

      try {
        console.log("[dashboard] polling tick");

        await fetchDashboardData(resolvedOrgId, {
          showSpinner: false,
        });
      } catch (e) {
        console.warn("[dashboard] polling error", e);
      }
    };

    tick();

    const intervalId = setInterval(tick, 10000);

    return () => {
      console.log("[dashboard] polling stopped");
      isActive = false;
      clearInterval(intervalId);
    };
  }, [resolvedOrgId, entitlementsLoading, isFree, isHistoryRequested, fetchDashboardData]);

  // Only map by user_id, no fallbacks
  const personalByUserId = useMemo(() => {
    const m = new Map();
    (personalRows || []).forEach((p) => {
      if (p?.user_id) m.set(String(p.user_id), p);
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


  const healthByUserId = useMemo(() => {
    const m = new Map();
    (trackerStatusRows || []).forEach((row) => {
      const uid = row?.tracker_user_id || row?.user_id || null;
      if (uid) m.set(String(uid), row);
    });
    return m;
  }, [trackerStatusRows]);


  // --- NUEVA CONSTRUCCIÓN trackersUi: merge assignment + latest + joins, display_name amigable ---
  const trackersUi = useMemo(() => {
    const assignmentsByUserId = new Map();
    (assignmentTrackers || []).forEach((a) => {
      const uid = normalizeUuid(a?.user_id);
      if (uid) assignmentsByUserId.set(String(uid), a);
    });

    const latestByUserId = new Map();
    (positions || []).forEach((row) => {
      const uid = normalizeUuid(row?.user_id);
      if (!uid) return;

      const key = String(uid);
      const current = latestByUserId.get(key);

      if (!current) {
        latestByUserId.set(key, row);
        return;
      }

      const currentTs = getPositionTs(current);
      const nextTs = getPositionTs(row);

      if (nextTs >= currentTs) {
        latestByUserId.set(key, row);
      }
    });

    const allUserIds = new Set([
      ...Array.from(assignmentsByUserId.keys()),
      ...Array.from(latestByUserId.keys()),
    ]);

    const result = [];
    for (const user_id of allUserIds) {
      const assignment = assignmentsByUserId.get(user_id) || {};
      const latest = latestByUserId.get(user_id) || {};

      const personalFromUser = personalByUserId.get(String(user_id)) || null;
      const personalId =
        latest?.personal_id ||
        assignment?.personal_id ||
        latest?.personal?.id ||
        assignment?.personal?.id ||
        null;
      const personalFromId = personalId ? personalById.get(String(personalId)) || null : null;
      const latestPersonal = latest?.personal || null;
      const assignmentPersonal = assignment?.personal || null;
      const latestProfile = latest?.profile || null;

      const resolvedPersonal =
        personalFromUser ||
        personalFromId ||
        latestPersonal ||
        assignmentPersonal ||
        null;

      const resolvedLabel =
        assignment?.display_name ||
        assignment?.name ||
        latest?.display_name ||
        latest?.name ||
        resolvedPersonal?.full_name ||
        resolvedPersonal?.nombre ||
        latestProfile?.full_name ||
        latestProfile?.nombre ||
        assignment?.email ||
        latest?.email ||
        (isValidUuid(user_id) ? undefined : user_id) ||
        user_id ||
        "(sin nombre)";

      const hasUsableLatest =
        latest &&
        Object.keys(latest).length > 0 &&
        (
          isValidLatLng(Number(latest?.lat), Number(latest?.lng)) ||
          getPositionTs(latest) > 0
        );

      const latestRow = hasUsableLatest
        ? latest
        : null;

      const merged = {
        ...assignment,
        ...latest,
        latest: latestRow,
        lat: hasUsableLatest
          ? Number(latest?.lat)
          : null,
        lng: hasUsableLatest
          ? Number(latest?.lng)
          : null,
        recorded_at: hasUsableLatest
          ? (
              latest?.recorded_at ??
              latest?.ts ??
              latest?.device_recorded_at ??
              latest?.created_at ??
              null
            )
          : null,
        ts: hasUsableLatest
          ? (
              latest?.ts ??
              latest?.recorded_at ??
              latest?.device_recorded_at ??
              latest?.created_at ??
              null
            )
          : null,
        personal: resolvedPersonal,
        profile: latestProfile,
        personal_id: personalId,
        display_name: resolvedLabel,
        label: resolvedLabel,
        baseLabel: resolvedLabel,
        trackerLabel: resolvedLabel,
      };

      const backendHealth = healthByUserId.get(String(user_id));
      const live = backendHealth
        ? { status: (backendHealth.status || "offline"), ageSec: null }
        : getTrackerLiveStatus(latest);
      merged.live = live;
      merged.statusPriority = getTrackerStatusPriority(live.status);

      const lat = Number(merged?.lat);
      const lng = Number(merged?.lng);
      merged.hasValidCoords = Number.isFinite(lat) && Number.isFinite(lng) && isValidLatLng(lat, lng);

      merged.key = merged.tracker_key || merged.user_id || user_id;
      merged.tracker_key = merged.tracker_key || merged.user_id || user_id;
      merged.user_id = merged.user_id || user_id;

      result.push(merged);
    }

    return result.sort((a, b) => {
      const priorityDelta = (a.statusPriority ?? 2) - (b.statusPriority ?? 2);
      if (priorityDelta !== 0) return priorityDelta;
      const ageDelta = (b.live?.ageSec ?? -1) - (a.live?.ageSec ?? -1);
      if (ageDelta !== 0) return ageDelta;
      return String(a.label || a.display_name || "").localeCompare(String(b.label || b.display_name || ""));
    });
  }, [positions, assignmentTrackers, personalById, personalByUserId, healthByUserId]);

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

  const assignmentMap = useMemo(() => {
    const m = new Map();

    for (const a of assignments || []) {
      if (!a) continue;

      if (a.user_id && a.tracker_key) {
        m.set(String(a.user_id), String(a.tracker_key));
      }
    }

    return m;
  }, [assignments]);

  const trackerMap = useMemo(() => {
    const m = new Map();

    for (const t of trackersUi || []) {
      if (!t) continue;

      if (t.tracker_key) m.set(String(t.tracker_key), t);
      if (t.user_id) m.set(String(t.user_id), t);
      if (t.id) m.set(String(t.id), t);
    }

    return m;
  }, [trackersUi]);

  const filteredGeofenceRows = useMemo(() => {
    const all = Array.isArray(geofenceRows) ? geofenceRows : [];
    if (!all.length) return [];
    if (Array.isArray(selectedGeofenceIds) && selectedGeofenceIds.length === 1 && selectedGeofenceIds[0] === "__none__") return [];
    if (!selectedGeofenceIds?.length) return all;
    const set = new Set(selectedGeofenceIds.map(String));
    return all.filter((g) => set.has(String(g.id)));
  }, [geofenceRows, selectedGeofenceIds]);

  useEffect(() => {
    if (selectedTrackerId === "all") return;
    const exists = trackersUi.some((x) => x.tracker_key === selectedTrackerId);
    if (!exists) setSelectedTrackerId("all");
  }, [selectedTrackerId, trackersUi]);

  const { items: layerItems } = useMemo(() => buildGeofenceLayerItems(filteredGeofenceRows), [filteredGeofenceRows]);

  const visiblePositions = useMemo(() => {
    if (!positions?.length) return [];

    // MODE 1: All trackers → only latest position per tracker
    if (selectedTrackerId === "all") {
      const latestByTracker = new Map();

      for (const p of positions) {
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
    return positions
      .filter((p) => getTrackerKey(p) === selectedTrackerId)
      .sort((a, b) => getPositionTs(a) - getPositionTs(b))
      .slice(-MAX_HISTORY_PER_TRACKER);
  }, [positions, selectedTrackerId]);

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

    const rows = Array.isArray(trackersUi) ? trackersUi : [];

    const markers = rows.reduce((acc, item, idx) => {
      const latest = item?.latest || null;
      const lat = Number(latest?.lat ?? item?.lat);
      const lng = Number(latest?.lng ?? item?.lng);

      if (!isValidLatLng(lat, lng)) return acc;

      acc.push({
        key: item?.tracker_key || item?.user_id || item?.key || `tracker-${idx}`,
        latest,
        lat,
        lng,

        // Campos necesarios para getFriendlyTrackerName()
        display_name: item?.display_name ?? item?.label ?? item?.trackerLabel ?? null,
        name: item?.name ?? null,
        personal: item?.personal ?? null,
        profile: item?.profile ?? null,
        email: item?.email ?? item?.personal?.email ?? item?.profile?.email ?? null,
        user_id: item?.user_id ?? null,

        personalId: item?.personalId || item?.personal_id || null,
        firstName: item?.firstName || null,
        lastName: item?.lastName || null,
        fullName: item?.fullName || null,
        trackerLabel:
          item?.label ||
          item?.display_name ||
          item?.baseLabel ||
          item?.trackerLabel ||
          item?.tracker_key ||
          item?.user_id,
        color: TRACKER_COLORS[idx % TRACKER_COLORS.length],
        live: item?.live || getTrackerLiveStatus(latest),
        hasValidCoords: true,
      });

      return acc;
    }, []);

    console.log("[tracker-map] markers_from_trackersUi", {
      trackersUi: rows.length,
      markers: markers.length,
      online: markers.filter((m) => m?.live?.status === "online").length,
      stale: markers.filter((m) => m?.live?.status === "stale").length,
      offline: markers.filter((m) => m?.live?.status === "offline").length,
    });

    return markers;
  }, [selectedTrackerId, trackersUi]);

  const filteredAllTrackerMarkers = useMemo(() => {
    if (selectedTrackerId !== "all") return allTrackerMarkers;
    if (statusFilter === "all") return allTrackerMarkers;

    return (allTrackerMarkers || []).filter((item) => {
      const live = item?.live || getTrackerLiveStatus(item?.latest);
      return live.status === statusFilter;
    });
  }, [allTrackerMarkers, selectedTrackerId, statusFilter]);

  const trackerStatusSummary = useMemo(() => {
    if (trackerCounts) {
      return {
        total: Number(trackerCounts.total_trackers || 0),
        online: Number(trackerCounts.active_count || 0),
        stale: Number(trackerCounts.stale_count || 0),
        offline: Number(trackerCounts.offline_count || 0),
      };
    }

    let total = 0;
    let online = 0;
    let stale = 0;
    let offline = 0;

    for (const item of allTrackerMarkers || []) {
      total += 1;
      const live = item?.live || getTrackerLiveStatus(item?.latest);

      if (live.status === "online") online += 1;
      else if (live.status === "stale") stale += 1;
      else offline += 1;
    }

    return { total, online, stale, offline };
  }, [allTrackerMarkers, trackerCounts]);

  const selectedTrackerPath = useMemo(() => {
    if (selectedTrackerId === "all") return null;

    const trackerPositions = Array.isArray(visiblePositions) ? visiblePositions : [];
    const latlngs = trackerPositions
      .map((p) => [Number(p?.lat), Number(p?.lng)])
      .filter(([lat, lng]) => isValidLatLng(lat, lng));

    return {
      positions: trackerPositions,
      latlngs,
      latest: trackerPositions[trackerPositions.length - 1] || null,
      live: getTrackerLiveStatus(trackerPositions[trackerPositions.length - 1] || null),
    };
  }, [selectedTrackerId, visiblePositions]);

  const mapFitPoints = useMemo(() => {
    if (selectedTrackerId === "all") {
      return (filteredAllTrackerMarkers || [])
        .filter((m) => m?.hasValidCoords)
        .map((m) => [Number(m?.lat), Number(m?.lng)])
        .filter(([lat, lng]) => isValidLatLng(lat, lng));
    }

    const singlePoints = Array.isArray(selectedTrackerPath?.latlngs) ? selectedTrackerPath.latlngs : [];
    if (singlePoints.length) return singlePoints;

    const latest = selectedTrackerPath?.latest;
    const lat = Number(latest?.lat);
    const lng = Number(latest?.lng);
    return isValidLatLng(lat, lng) ? [[lat, lng]] : [];
  }, [selectedTrackerId, filteredAllTrackerMarkers, selectedTrackerPath]);

  const mapZoom = useMemo(() => (isDemoOrg ? 18 : 12), [isDemoOrg]);

  const mapCenter = useMemo(() => {
    const markerCandidates =
      (allTrackerMarkers || []).filter((m) => isValidLatLng(m?.lat, m?.lng));

    if (markerCandidates.length) {
      const best = markerCandidates.reduce((acc, cur) => {
        const ts = getPositionTs(cur?.latest);
        const accTs = getPositionTs(acc?.latest);
        return ts > accTs ? cur : acc;
      }, markerCandidates[0]);

      if (best) return [best.lat, best.lng];
    }

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
  }, [allTrackerMarkers, visiblePositions, positions, layerItems]);

  // Badge component kept for non-diagnostic use
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
            {orgResolveError && (
              <div className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {tOr("trackerDashboard.messages.orgResolveError", "Error resolving org")} {" "}
                <span className="font-mono">{orgResolveError}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => refreshSession()}
              className="inline-flex items-center justify-center rounded-md bg-white text-gray-900 px-4 py-2 text-sm font-medium
                         border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            >
              {tOr("trackerDashboard.actions.refreshSessionOrg", "Refresh session org")}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!resolvedOrgId) return;
                if (isHistoryRequested) fetchPositions(resolvedOrgId, { showSpinner: true });
                else fetchDashboardData(resolvedOrgId, { showSpinner: true });
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

        {/* Remove blue info banner for resolving org (technical/diagnostic) */}

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
                    placeholder={t("common.search")}
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
                        {x.label || getFriendlyTrackerName(x)}
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
                <div className="pointer-events-none absolute top-3 left-16 z-[1000] rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-sm">
                  <div className="text-[11px] font-semibold text-gray-900 mb-1">{t("map.coordinates")}</div>
                  <div className="space-y-0.5 text-xs text-gray-700">
                    <div>{t("map.lat")}: {cursorCoords?.lat == null ? "—" : Number(cursorCoords.lat).toFixed(6)}</div>
                    <div>{t("map.lng")}: {cursorCoords?.lng == null ? "—" : Number(cursorCoords.lng).toFixed(6)}</div>
                    {/* Barra de escala */}
                    <div className="mt-1 h-0.5 w-16 rounded bg-gray-800" />
                    {/* Texto de escala */}
                    <div>{scaleLabel}</div>
                  </div>
                </div>

                <div className="absolute top-3 right-3 z-[1000] rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-sm">
                  <div className="text-[11px] font-semibold text-gray-900 mb-2">
                    {t("map.legend")}
                  </div>
                  <div className="space-y-1.5 text-xs text-gray-700">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-blue-600 bg-blue-600" />
                      <span>{t("status.online")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-blue-600 bg-blue-600 opacity-70" />
                      <span>{t("status.stale")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-500 bg-gray-500 opacity-60" />
                      <span>{t("status.offline")}</span>
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
                      const size = map?.getSize?.();
                      setDiag((d) => ({
                        ...d,
                        mapCreated: true,
                        w: size?.x ?? null,
                        h: size?.y ?? null,
                        zoom: map?.getZoom?.() ?? null,
                      }));
                      map.invalidateSize();
                    } catch {}
                  }}
                >
                  <FitIfOutOfView
                    layerItems={layerItems}
                    markerPoints={
                      selectedTrackerId === "all"
                        ? (filteredAllTrackerMarkers || []).map((m) => [m?.lat, m?.lng])
                        : mapFitPoints
                    }
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
                    onViewportComputed={() => {}}
                  />

                  <CursorCoordinatesOverlay onChange={setCursorCoords} onScaleChange={setScaleLabel} />

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

              <div className="border-t border-gray-200">
                <div className="px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">
                    {t("tracker.title")}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-y border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">{t("table.name")}</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">{t("table.status")}</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">{t("table.lastPosition")}</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">{t("table.lastUpdate")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(trackersUi || []).map((t) => {
                        const latestRow = t?.latest || null;
                        const live = t?.live || getTrackerLiveStatus(latestRow || t);

                        const rawLat = latestRow?.lat;
                        const rawLng = latestRow?.lng;
                        const hasCoords = isValidLatLng(Number(rawLat), Number(rawLng));

                        const lat = hasCoords ? Number(rawLat) : null;
                        const lng = hasCoords ? Number(rawLng) : null;
                        const ts = getPositionTs(latestRow || t);
                        return (
                          <tr key={String(t?.user_id ?? t?.tracker_key ?? t?.key ?? "unknown")} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-900">{getFriendlyTrackerName(t)}</td>
                            <td className="px-4 py-2 text-gray-700">{getStatusLabel(live?.status)}</td>
                            <td className="px-4 py-2 text-gray-700">
                              {lat !== null && lng !== null
                                ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
                                : "—"}
                            </td>
                            <td className="px-4 py-2 text-gray-700">{ts ? new Date(ts).toLocaleString() : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {/* Removed preview-only geofence events panel (diagnostic/technical UI) */}
        </div>
      </div>
    </div>
  );
}