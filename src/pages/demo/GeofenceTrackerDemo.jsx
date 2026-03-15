import React, { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ---------------------------------------------------------------------------
// Region configuration
// ---------------------------------------------------------------------------
const REGIONS = {
  quito: {
    center: [-0.22985, -78.52495],
    zoom: 15,
    bounds: [
      [-0.2328, -78.5289],
      [-0.2268, -78.521],
    ],
    popupText: "Geofence event detected<br/>Quito Operations Area",
    tooltip: "Quito Operations Area",
    subtitle: "Quito Geofence Monitoring Demo",
    chip: "Region: Quito, Ecuador",
    hudTitle: "Quito Geofence",
    hudBody: "Primary tracker is moving toward the monitored city perimeter.",
    legendGeofence: "Geofence area",
    toastDefault: "Geofence event detected — Quito Operations Area",
  },
  mwea: {
    center: [-0.6305, 37.3783],
    zoom: 15,
    bounds: [
      [-0.6334, 37.3756],
      [-0.6288, 37.3811],
    ],
    popupText: "Geofence event detected<br/>Mwea Rice Fields",
    tooltip: "Mwea Rice Fields",
    subtitle: "Mwea Rice Fields Live Geofence Monitoring",
    chip: "Region: Mwea, Kenya",
    hudTitle: "Mwea Rice Fields",
    hudBody: "Monitoring active. Primary tracker approaching the rice field perimeter.",
    legendGeofence: "Geofence (rice field)",
    toastDefault: "Geofence event detected — Mwea Rice Fields",
  },
};

// ---------------------------------------------------------------------------
// Tracker paths (shared across regions — simulation data)
// ---------------------------------------------------------------------------
const TRACKER_A_PATH = [
  [-0.6388, 37.3672],
  [-0.6372, 37.3709],
  [-0.6358, 37.3731],
  [-0.6341, 37.3758],
  [-0.6325, 37.3772],
  [-0.631, 37.3787],
  [-0.6301, 37.3795],
];

const TRACKER_B_PATH = [
  [-0.6294, 37.3873],
  [-0.6279, 37.3892],
  [-0.6256, 37.3903],
  [-0.624, 37.3887],
  [-0.6248, 37.3859],
  [-0.6271, 37.3847],
];

const TRACKER_C_PATH = [
  [-0.6368, 37.3684],
  [-0.638, 37.3711],
  [-0.6391, 37.3732],
  [-0.6376, 37.375],
  [-0.6355, 37.374],
  [-0.6358, 37.3714],
];

const FIELD_A = [
  [-0.6363, 37.3714],
  [-0.6349, 37.3743],
  [-0.6327, 37.3735],
  [-0.6336, 37.3707],
];

const FIELD_B = [
  [-0.6268, 37.3825],
  [-0.6255, 37.3866],
  [-0.6218, 37.3855],
  [-0.6234, 37.3819],
];

// ---------------------------------------------------------------------------
// Animation helpers
// ---------------------------------------------------------------------------
function lerpPoint(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function getPointAlongPath(path, progress) {
  const segments = path.length - 1;
  const clamped = Math.max(0, Math.min(progress, 0.9999));
  const scaled = clamped * segments;
  const idx = Math.floor(scaled);
  return lerpPoint(path[idx], path[idx + 1], scaled - idx);
}

// ---------------------------------------------------------------------------
// Scoped CSS string (injected once via <style> — classes prefixed with gd-)
// ---------------------------------------------------------------------------
const DEMO_CSS = `
.gd-root {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 100vh;
  padding: 16px;
  gap: 12px;
  font-family: "Segoe UI", "Inter", "Avenir Next", sans-serif;
  color: #15241c;
  background:
    radial-gradient(circle at 10% 10%, #dff6ea 0, transparent 45%),
    radial-gradient(circle at 90% 90%, #dbe9ff 0, transparent 42%),
    #f3f7f4;
  box-sizing: border-box;
}
.gd-root *, .gd-root *::before, .gd-root *::after { box-sizing: border-box; }

.gd-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(16,24,40,0.08);
  box-shadow: 0 10px 30px rgba(21,36,28,0.08);
}

.gd-brand { display: flex; align-items: center; gap: 10px; }
.gd-brand-badge {
  width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
  display: grid; place-items: center; color: #fff; font-weight: 700;
  background: linear-gradient(140deg, #0e9d63, #0e7b98);
}
.gd-brand h1 { margin: 0; font-size: 18px; }
.gd-brand p  { margin: 2px 0 0; font-size: 12px; color: #567064; }

.gd-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.gd-chip {
  font-size: 12px; padding: 6px 10px; border-radius: 999px;
  background: #eef4f1; border: 1px solid rgba(16,24,40,0.08);
}

.gd-map-wrap {
  position: relative; border-radius: 18px; overflow: hidden;
  border: 1px solid rgba(16,24,40,0.1);
  box-shadow: 0 12px 32px rgba(21,36,28,0.1);
}

.gd-map {
  width: 100%;
  height: calc(100vh - 130px);
  min-height: 560px;
}

.gd-hud {
  position: absolute; z-index: 900; left: 14px; top: 14px;
  padding: 12px; border-radius: 12px;
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(16,24,40,0.1);
  box-shadow: 0 8px 20px rgba(21,36,28,0.08);
  min-width: 265px;
}
.gd-hud h2 { margin: 0 0 6px; font-size: 14px; }
.gd-hud p  { margin: 0; font-size: 12px; color: #567064; }

.gd-controls {
  position: absolute; z-index: 900; right: 14px; top: 14px;
  display: flex; gap: 8px;
}
.gd-btn {
  border: 1px solid rgba(16,24,40,0.14);
  background: rgba(255,255,255,0.92);
  color: #15241c;
  width: 42px; height: 42px; border-radius: 10px;
  font-weight: 700; font-size: 18px; cursor: pointer;
}
.gd-btn.play { width: auto; padding: 0 14px; font-size: 13px; }

.gd-region-switcher {
  position: absolute; z-index: 900; top: 14px; left: 50%;
  transform: translateX(-50%);
  display: flex;
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(16,24,40,0.1);
  border-radius: 10px; padding: 4px;
  box-shadow: 0 4px 12px rgba(21,36,28,0.08);
}
.gd-region-btn {
  border: none; background: transparent; color: #567064;
  padding: 6px 18px; border-radius: 7px;
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.gd-region-btn:hover { background: rgba(15,143,91,0.1); }
.gd-region-btn.active { background: #0f8f5b; color: #fff; }

.gd-toast {
  position: absolute; z-index: 900; left: 50%; bottom: 16px;
  transform: translateX(-50%);
  background: rgba(19,31,23,0.92); color: #effcf3;
  padding: 10px 14px; border-radius: 10px; text-align: center;
  border: 1px solid rgba(128,246,168,0.4);
  font-size: 13px; line-height: 1.5;
  opacity: 0; transition: opacity 0.25s ease; pointer-events: none;
  white-space: nowrap;
}
.gd-toast.show { opacity: 1; }

.gd-legend {
  position: absolute; z-index: 900; right: 14px; bottom: 14px;
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(16,24,40,0.1);
  border-radius: 10px; padding: 10px; font-size: 12px; min-width: 180px;
}
.gd-legend-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.gd-legend-row:last-child { margin-bottom: 0; }
.gd-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

@media (max-width: 900px) {
  .gd-topbar { flex-direction: column; align-items: flex-start; }
  .gd-map { height: calc(100vh - 170px); min-height: 520px; }
}
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GeofenceTrackerDemo({ initialRegion }) {
  const mapDivRef = useRef(null);
  const leafletRef = useRef(null); // { map, geofence, trackerA, activeBounds }
  const rafIdRef = useRef(null);
  const runningRef = useRef(true);
  const regionKeyRef = useRef(initialRegion);
  const toastTimerRef = useRef(null);
  const stateRef = useRef({ eventTriggered: false, insideBefore: false, lastTime: 0 });

  const [regionKey, setRegionKey] = useState(initialRegion);
  const [running, setRunning] = useState(true);
  const [statusText, setStatusText] = useState("Tracker: Approaching geofence");
  const [toastVisible, setToastVisible] = useState(false);
  const [toastHtml, setToastHtml] = useState("");

  // Keep refs in sync with state
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { regionKeyRef.current = regionKey; }, [regionKey]);

  // ------------------------------------------------------------------
  // Map initialisation — runs once on mount
  // ------------------------------------------------------------------
  useEffect(() => {
    const container = mapDivRef.current;
    if (!container || leafletRef.current) return;

    const initR = REGIONS[initialRegion];
    const map = L.map(container, { zoomControl: false }).setView(initR.center, initR.zoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const geofence = L.rectangle(initR.bounds, {
      color: "#10b981",
      weight: 2,
      fillColor: "#34d399",
      fillOpacity: 0.2,
      dashArray: "6 6",
    }).addTo(map);
    geofence.bindTooltip(initR.tooltip, { permanent: false });

    let activeBounds = L.latLngBounds(initR.bounds);

    L.polygon(FIELD_A, { color: "#7c9f89", weight: 1, fillOpacity: 0.08 }).addTo(map);
    L.polygon(FIELD_B, { color: "#7c9f89", weight: 1, fillOpacity: 0.08 }).addTo(map);

    function makeTracker(path, color, label) {
      const marker = L.circleMarker(path[0], {
        radius: 7, color, fillColor: color, fillOpacity: 1, weight: 2,
      }).addTo(map);
      marker.bindPopup(label);
      const routeLine = L.polyline([path[0]], { color, weight: 3, opacity: 0.55 }).addTo(map);
      return { marker, routeLine, path, progress: 0, speed: 0.035 };
    }

    const trackerA = makeTracker(TRACKER_A_PATH, "#2563eb", "Tracker A");
    const trackerB = makeTracker(TRACKER_B_PATH, "#ef4444", "Tracker B");
    const trackerC = makeTracker(TRACKER_C_PATH, "#f59e0b", "Tracker C");

    const allTargets = L.featureGroup([geofence, trackerA.marker, trackerB.marker, trackerC.marker]);
    map.fitBounds(allTargets.getBounds().pad(0.18));

    leafletRef.current = { map, geofence, trackerA,
      getActiveBounds: () => activeBounds,
      setActiveBounds: (b) => { activeBounds = b; },
    };

    stateRef.current = { eventTriggered: false, insideBefore: false, lastTime: performance.now() };

    // ---- animation loop ----
    function updateTracker(tracker, dt, loop) {
      tracker.progress += tracker.speed * dt;
      if (tracker.progress > 1) {
        tracker.progress = loop ? tracker.progress - 1 : 1;
      }
      const [lat, lng] = getPointAlongPath(tracker.path, tracker.progress);
      const ll = L.latLng(lat, lng);
      tracker.marker.setLatLng(ll);
      const latlngs = tracker.routeLine.getLatLngs();
      latlngs.push(ll);
      if (latlngs.length > 120) latlngs.shift();
      tracker.routeLine.setLatLngs(latlngs);
    }

    function tick(now) {
      const s = stateRef.current;
      const dt = Math.min((now - s.lastTime) / 1000, 0.06);
      s.lastTime = now;

      if (runningRef.current) {
        updateTracker(trackerA, dt, false);
        updateTracker(trackerB, dt, true);
        updateTracker(trackerC, dt, true);

        const insideNow = activeBounds.contains(trackerA.marker.getLatLng());
        if (insideNow && !s.insideBefore && !s.eventTriggered) {
          s.eventTriggered = true;
          const r = REGIONS[regionKeyRef.current];
          setToastHtml(r.popupText);
          setToastVisible(true);
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          toastTimerRef.current = setTimeout(() => setToastVisible(false), 2600);
          trackerA.marker.bindPopup(r.popupText).openPopup();
          setStatusText("Tracker: Geofence event detected");
        }
        s.insideBefore = insideNow;
      }

      rafIdRef.current = requestAnimationFrame(tick);
    }

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      clearTimeout(toastTimerRef.current);
      map.remove();
      leafletRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Region switch — driven by React state change
  // ------------------------------------------------------------------
  const prevRegionRef = useRef(initialRegion);
  useEffect(() => {
    if (regionKey === prevRegionRef.current) return;
    prevRegionRef.current = regionKey;
    const inst = leafletRef.current;
    if (!inst) return;
    const r = REGIONS[regionKey];
    inst.map.flyTo(r.center, r.zoom);
    inst.geofence.setBounds(r.bounds);
    inst.geofence.unbindTooltip();
    inst.geofence.bindTooltip(r.tooltip, { permanent: false });
    inst.setActiveBounds(L.latLngBounds(r.bounds));
    stateRef.current.eventTriggered = false;
    stateRef.current.insideBefore = false;
    inst.trackerA.marker.closePopup();
    setStatusText("Tracker: Approaching geofence");
  }, [regionKey]);

  const handleSwitchRegion = useCallback((key) => {
    setRegionKey(key);
  }, []);

  const handleTogglePlay = useCallback(() => {
    setRunning((v) => !v);
  }, []);

  const region = REGIONS[regionKey];

  return (
    <>
      <style>{DEMO_CSS}</style>
      <div className="gd-root">
        {/* ---- top bar ---- */}
        <header className="gd-topbar">
          <div className="gd-brand">
            <div className="gd-brand-badge">G</div>
            <div>
              <h1>GeocercasApp</h1>
              <p>{region.subtitle}</p>
            </div>
          </div>
          <div className="gd-chips">
            <div className="gd-chip">{region.chip}</div>
            <div className="gd-chip">Mode: Preview Simulation</div>
            <div className="gd-chip">{statusText}</div>
          </div>
        </header>

        {/* ---- map section ---- */}
        <section className="gd-map-wrap">
          <div ref={mapDivRef} className="gd-map" />

          <aside className="gd-hud">
            <h2>{region.hudTitle}</h2>
            <p>{region.hudBody}</p>
          </aside>

          {/* zoom + play controls */}
          <div className="gd-controls">
            <button
              className="gd-btn"
              aria-label="Zoom in"
              onClick={() => leafletRef.current?.map.zoomIn()}
            >+</button>
            <button
              className="gd-btn"
              aria-label="Zoom out"
              onClick={() => leafletRef.current?.map.zoomOut()}
            >−</button>
            <button className="gd-btn play" onClick={handleTogglePlay}>
              {running ? "Pause" : "Play"}
            </button>
          </div>

          {/* region switcher */}
          <div className="gd-region-switcher">
            <button
              className={`gd-region-btn${regionKey === "quito" ? " active" : ""}`}
              onClick={() => handleSwitchRegion("quito")}
            >
              Quito
            </button>
            <button
              className={`gd-region-btn${regionKey === "mwea" ? " active" : ""}`}
              onClick={() => handleSwitchRegion("mwea")}
            >
              Mwea
            </button>
          </div>

          {/* event toast */}
          <div
            className={`gd-toast${toastVisible ? " show" : ""}`}
            dangerouslySetInnerHTML={{ __html: toastHtml }}
          />

          {/* legend */}
          <div className="gd-legend">
            <div className="gd-legend-row">
              <span className="gd-dot" style={{ background: "#10b981" }} />
              {region.legendGeofence}
            </div>
            <div className="gd-legend-row">
              <span className="gd-dot" style={{ background: "#2563eb" }} />
              Tracker A (primary)
            </div>
            <div className="gd-legend-row">
              <span className="gd-dot" style={{ background: "#ef4444" }} />
              Tracker B
            </div>
            <div className="gd-legend-row">
              <span className="gd-dot" style={{ background: "#f59e0b" }} />
              Tracker C
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
