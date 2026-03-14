import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const LOOP_MS = 10000;
const MAP_CENTER = [-0.1807, -78.4678];
const MAP_ZOOM = 12;

const GEOFENCE_BOUNDS = [
  [-0.32, -78.58],
  [-0.05, -78.32],
];

function buildCirclePath(centerLat, centerLng, latRadius, lngRadius, points) {
  const out = [];
  for (let i = 0; i <= points; i += 1) {
    const t = (i / points) * Math.PI * 2;
    out.push([centerLat + Math.sin(t) * latRadius, centerLng + Math.cos(t) * lngRadius]);
  }
  return out;
}

const TRACKERS = [
  {
    id: "T1",
    color: "#2563eb",
    phase: 0.0,
    eventAt: 0.33,
    // North -> South, entering geofence from top.
    path: [
      [-0.02, -78.47],
      [-0.08, -78.47],
      [-0.16, -78.47],
      [-0.24, -78.47],
      [-0.34, -78.47],
    ],
  },
  {
    id: "T2",
    color: "#16a34a",
    phase: 0.2,
    // Loops around geofence.
    path: buildCirclePath(-0.185, -78.45, 0.19, 0.17, 48),
  },
  {
    id: "T3",
    color: "#f59e0b",
    phase: 0.4,
    // Diagonal crossing.
    path: [
      [-0.35, -78.61],
      [-0.27, -78.55],
      [-0.18, -78.48],
      [-0.1, -78.41],
      [-0.01, -78.33],
    ],
  },
  {
    id: "T4",
    color: "#dc2626",
    phase: 0.6,
    eventAt: 0.82,
    // Starts inside and exits geofence west/southwest.
    path: [
      [-0.18, -78.46],
      [-0.2, -78.5],
      [-0.23, -78.56],
      [-0.27, -78.62],
    ],
  },
];

function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function wrapDistance(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

function buildPathMetrics(path) {
  const segmentLengths = [];
  let totalLength = 0;

  for (let i = 1; i < path.length; i += 1) {
    const len = distance(path[i - 1], path[i]);
    segmentLengths.push(len);
    totalLength += len;
  }

  return { path, segmentLengths, totalLength };
}

function pointAt(metrics, t) {
  if (!metrics.path.length) return [0, 0];
  if (metrics.totalLength <= 0) return metrics.path[0];

  let remaining = metrics.totalLength * t;

  for (let i = 1; i < metrics.path.length; i += 1) {
    const segLen = metrics.segmentLengths[i - 1];
    if (remaining <= segLen) {
      const [lat1, lng1] = metrics.path[i - 1];
      const [lat2, lng2] = metrics.path[i];
      const ratio = segLen > 0 ? remaining / segLen : 0;
      return [lat1 + (lat2 - lat1) * ratio, lng1 + (lng2 - lng1) * ratio];
    }
    remaining -= segLen;
  }

  return metrics.path[metrics.path.length - 1];
}

function trailUntil(metrics, t) {
  if (!metrics.path.length) return [];
  if (metrics.path.length === 1) return [metrics.path[0]];

  const points = [metrics.path[0]];
  if (metrics.totalLength <= 0) return points;

  let remaining = metrics.totalLength * t;

  for (let i = 1; i < metrics.path.length; i += 1) {
    const segLen = metrics.segmentLengths[i - 1];
    if (remaining <= segLen) {
      const [lat1, lng1] = metrics.path[i - 1];
      const [lat2, lng2] = metrics.path[i];
      const ratio = segLen > 0 ? remaining / segLen : 0;
      points.push([lat1 + (lat2 - lat1) * ratio, lng1 + (lng2 - lng1) * ratio]);
      return points;
    }
    points.push(metrics.path[i]);
    remaining -= segLen;
  }

  return points;
}

export default function InteractiveMapDemo() {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const geofenceRef = useRef(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const geofencePulseUntilRef = useRef(0);
  const prevT1NearEventRef = useRef(false);
  const prevT4NearEventRef = useRef(false);

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return undefined;

    const map = L.map(mapElRef.current, {
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      zoomControl: false,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    L.control.zoom({ position: "topright" }).addTo(map);

    // Ensure Leaflet computes size correctly when mounted inside responsive hero layouts.
    map.invalidateSize();
    window.setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {}
    }, 0);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const geofence = L.rectangle(GEOFENCE_BOUNDS, {
      color: "#2563eb",
      weight: 2,
      fillColor: "#2563eb",
      fillOpacity: 0.08,
    }).addTo(map);
    geofenceRef.current = geofence;

    const trackerLayers = TRACKERS.map((tracker) => {
      const metrics = buildPathMetrics(tracker.path);
      const start = pointAt(metrics, 0);

      const trail = L.polyline([start], {
        color: tracker.color,
        weight: 2,
        opacity: 0.85,
      }).addTo(map);

      const marker = L.circleMarker(start, {
        radius: 6,
        color: "#ffffff",
        weight: 1.5,
        fillColor: tracker.color,
        fillOpacity: 1,
      }).addTo(map);

      marker.bindTooltip(tracker.id, {
        permanent: true,
        direction: "top",
        offset: [0, -8],
        className: "tracker-id-tooltip",
      });

      return { tracker, metrics, marker, trail };
    });

    const frame = (now) => {
      if (!startRef.current) startRef.current = now;
      const loopProgress = ((now - startRef.current) % LOOP_MS) / LOOP_MS;

      let t1LocalT = null;
      let t4LocalT = null;

      trackerLayers.forEach(({ tracker, metrics, marker, trail }) => {
        const localT = (loopProgress + tracker.phase) % 1;
        const point = pointAt(metrics, localT);
        const trailPoints = trailUntil(metrics, localT);

        if (tracker.id === "T1") t1LocalT = localT;
        if (tracker.id === "T4") t4LocalT = localT;

        marker.setLatLng(point);
        trail.setLatLngs(trailPoints);
      });

      const t1Glow = Number.isFinite(t1LocalT)
        ? wrapDistance(t1LocalT, TRACKERS.find((t) => t.id === "T1")?.eventAt || 0) < 0.05
        : false;
      const t4Glow = Number.isFinite(t4LocalT)
        ? wrapDistance(t4LocalT, TRACKERS.find((t) => t.id === "T4")?.eventAt || 0) < 0.05
        : false;

      // Trigger a short geofence pulse when each event window starts.
      if (t1Glow && !prevT1NearEventRef.current) geofencePulseUntilRef.current = now + 420;
      if (t4Glow && !prevT4NearEventRef.current) geofencePulseUntilRef.current = now + 420;
      prevT1NearEventRef.current = t1Glow;
      prevT4NearEventRef.current = t4Glow;

      const pulseActive = now < geofencePulseUntilRef.current;

      if (geofenceRef.current) {
        geofenceRef.current.setStyle({
          weight: pulseActive ? 3.2 : 2,
          fillOpacity: pulseActive ? 0.18 : 0.08,
          opacity: pulseActive ? 0.95 : 0.85,
        });
      }

      rafRef.current = window.requestAnimationFrame(frame);
    };

    rafRef.current = window.requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
      geofenceRef.current = null;
      geofencePulseUntilRef.current = 0;
      prevT1NearEventRef.current = false;
      prevT4NearEventRef.current = false;
      startRef.current = 0;
    };
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.45)]">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
        Demo en vivo · Quito · Loop 10s
      </div>

      <div className="pointer-events-none absolute left-3 top-12 z-[500] rounded-lg border border-white/80 bg-white/85 px-3 py-2 text-[11px] text-slate-700 shadow-sm backdrop-blur-sm">
        <p className="font-semibold text-slate-800">Trackers activos: 4</p>
        <p className="mt-1 font-medium text-slate-700">Eventos recientes:</p>
        <p className="text-slate-600">T1 entró a geocerca</p>
        <p className="text-slate-600">T4 salió de geocerca</p>
      </div>

      <div ref={mapElRef} className="h-[320px] w-full md:h-[360px]" />
    </div>
  );
}
