import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, PlayCircle, Radar, Route, ShieldCheck } from "lucide-react";

const LOOP_SECONDS = 10;
const VIEWBOX = { width: 100, height: 62 };

const GEOFENCE = {
  x: 39,
  y: 20,
  width: 24,
  height: 16,
};

const TRACKERS = [
  {
    id: "T1",
    color: "#2563eb",
    phase: 0.02,
    path: [
      [22, 40],
      [28, 34],
      [35, 28],
      [43, 25],
      [50, 26],
      [58, 30],
      [64, 35],
      [70, 40],
    ],
    eventType: "enter",
    eventAt: 0.34,
  },
  {
    id: "T2",
    color: "#16a34a",
    phase: 0.21,
    path: [
      [15, 20],
      [23, 24],
      [31, 29],
      [40, 33],
      [49, 35],
      [59, 33],
      [68, 29],
      [78, 24],
    ],
  },
  {
    id: "T3",
    color: "#f59e0b",
    phase: 0.47,
    path: [
      [18, 50],
      [29, 48],
      [40, 45],
      [52, 41],
      [61, 36],
      [69, 29],
      [76, 22],
    ],
  },
  {
    id: "T4",
    color: "#dc2626",
    phase: 0.69,
    path: [
      [80, 18],
      [74, 24],
      [69, 30],
      [63, 34],
      [56, 36],
      [47, 38],
      [37, 41],
      [27, 47],
    ],
    eventType: "exit",
    eventAt: 0.76,
  },
];

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

function Card({ className, children }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-white/60 bg-white/85 text-slate-900 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.45)] backdrop-blur",
        className
      )}
    >
      {children}
    </div>
  );
}

function CardContent({ className, children }) {
  return <div className={cn("p-6", className)}>{children}</div>;
}

function Button({ className, variant = "default", children, ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 py-3 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:pointer-events-none disabled:opacity-50";
  const variants = {
    default: "bg-sky-600 text-white hover:bg-sky-500 shadow-lg shadow-sky-600/30",
    outline: "border border-slate-300 bg-white/90 text-slate-800 hover:bg-slate-100",
  };

  return (
    <button className={cn(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function wrapDistance(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

function buildPathMetrics(points) {
  const segmentLengths = [];
  let totalLength = 0;

  for (let i = 1; i < points.length; i += 1) {
    const len = distance(points[i - 1], points[i]);
    segmentLengths.push(len);
    totalLength += len;
  }

  const d = points
    .map((point, index) => {
      const cmd = index === 0 ? "M" : "L";
      return `${cmd}${point[0]} ${point[1]}`;
    })
    .join(" ");

  return { points, segmentLengths, totalLength, d };
}

function pointAt(metrics, t) {
  if (metrics.totalLength <= 0) {
    return metrics.points[0] || [0, 0];
  }

  let remaining = metrics.totalLength * t;

  for (let i = 1; i < metrics.points.length; i += 1) {
    const segLen = metrics.segmentLengths[i - 1];
    if (remaining <= segLen) {
      const [x1, y1] = metrics.points[i - 1];
      const [x2, y2] = metrics.points[i];
      const ratio = segLen > 0 ? remaining / segLen : 0;
      return [x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio];
    }
    remaining -= segLen;
  }

  return metrics.points[metrics.points.length - 1];
}

export default function HeroGeocercasDemo() {
  const [loopProgress, setLoopProgress] = useState(0);

  useEffect(() => {
    let rafId = 0;
    let start = 0;

    const frame = (now) => {
      if (!start) start = now;
      const elapsedSeconds = ((now - start) / 1000) % LOOP_SECONDS;
      setLoopProgress(elapsedSeconds / LOOP_SECONDS);
      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const trackerStates = useMemo(() => {
    return TRACKERS.map((tracker) => {
      const metrics = buildPathMetrics(tracker.path);
      const localT = (loopProgress + tracker.phase) % 1;
      const [x, y] = pointAt(metrics, localT);

      return {
        ...tracker,
        metrics,
        localT,
        x,
        y,
      };
    });
  }, [loopProgress]);

  const geofenceGlow = useMemo(() => {
    const t1 = trackerStates.find((t) => t.id === "T1");
    const t4 = trackerStates.find((t) => t.id === "T4");

    if (!t1 || !t4) return false;

    const t1Enter = wrapDistance(t1.localT, t1.eventAt || 0) < 0.05;
    const t4Exit = wrapDistance(t4.localT, t4.eventAt || 0) < 0.05;

    return t1Enter || t4Exit;
  }, [trackerStates]);

  return (
    <section className="relative isolate overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(150deg,#f8fafc_0%,#eef6ff_45%,#eef2ff_100%)] px-6 py-12 sm:px-10 lg:px-14">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.15),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.14),transparent_30%)]" />

      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-4 py-2 text-xs font-semibold tracking-wide text-sky-700">
            <Radar className="h-3.5 w-3.5" />
            Monitoreo GPS con geocercas en tiempo real
          </div>

          <h1 className="max-w-xl text-balance text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Visualiza personal, rutas y eventos dentro de tus geocercas.
          </h1>

          <p className="max-w-2xl text-pretty text-base leading-relaxed text-slate-600 sm:text-lg">
            App Geocercas convierte posiciones GPS en una vista operativa clara: quién se movió, quién entró,
            quién salió y qué está pasando ahora mismo en el mapa.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button>
              Ver demo en preview
              <PlayCircle className="h-4 w-4" />
            </Button>
            <Button variant="outline">
              Solicitar presentación
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700">
              <Route className="h-4 w-4 text-blue-600" />
              Trackers activos: 4
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              Geocercas: 1
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700">
              <Radar className="h-4 w-4 text-blue-600" />
              Eventos: Entrada / salida
            </div>
          </div>
        </div>

        <div className="w-full">
          <Card className="overflow-hidden rounded-[1.6rem] border-white/70 shadow-[0_24px_80px_-32px_rgba(2,8,23,0.55)]">
            <CardContent className="p-0">
              <div className="relative aspect-[16/11] w-full overflow-hidden">
                <img
                  src="/marketing/mapa-geocercas-hero.png"
                  alt="Mapa de geocercas en preview"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900/10 via-transparent to-slate-900/20" />

                <div className="absolute left-4 top-4 rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-xs shadow-lg backdrop-blur">
                  <p className="font-semibold text-slate-900">Dashboard</p>
                  <p className="text-slate-600">Trackers activos: 4</p>
                  <p className="text-slate-600">Geocercas: 1</p>
                </div>

                <div className="absolute right-4 top-4 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow">
                  Loop 10s
                </div>

                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
                  preserveAspectRatio="none"
                >
                  <rect
                    x={GEOFENCE.x}
                    y={GEOFENCE.y}
                    width={GEOFENCE.width}
                    height={GEOFENCE.height}
                    rx="2"
                    fill="rgba(37, 99, 235, 0.12)"
                    stroke="rgba(37, 99, 235, 0.9)"
                    strokeWidth="0.7"
                    opacity={geofenceGlow ? 1 : 0.72}
                    style={{
                      filter: geofenceGlow
                        ? "drop-shadow(0 0 8px rgba(37,99,235,0.8))"
                        : "drop-shadow(0 0 0px rgba(37,99,235,0))",
                      transition: "opacity 280ms ease-out, filter 280ms ease-out",
                    }}
                  />

                  {trackerStates.map((tracker, idx) => {
                    const trailOffset = tracker.metrics.totalLength * (1 - tracker.localT);

                    return (
                      <g key={tracker.id}>
                        <path
                          d={tracker.metrics.d}
                          fill="none"
                          stroke={tracker.color}
                          strokeOpacity="0.15"
                          strokeWidth="0.7"
                        />

                        <path
                          d={tracker.metrics.d}
                          fill="none"
                          stroke={tracker.color}
                          strokeWidth="1"
                          strokeLinecap="round"
                          strokeDasharray={tracker.metrics.totalLength}
                          strokeDashoffset={trailOffset}
                          opacity="0.95"
                        />

                        <circle
                          cx={tracker.x}
                          cy={tracker.y}
                          r="2.6"
                          fill={tracker.color}
                          style={{
                            transformOrigin: `${tracker.x}px ${tracker.y}px`,
                            animation: `trackerPulse 1.8s ease-out ${idx * 0.18}s infinite`,
                          }}
                        />

                        <circle cx={tracker.x} cy={tracker.y} r="1.15" fill={tracker.color} stroke="white" strokeWidth="0.45" />

                        <g transform={`translate(${tracker.x + 1.4} ${tracker.y - 3.8})`}>
                          <rect rx="2.4" width="8" height="4.5" fill="rgba(15, 23, 42, 0.78)" />
                          <text x="4" y="3" textAnchor="middle" fontSize="2.35" fontWeight="700" fill="white">
                            {tracker.id}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <style>{`
        @keyframes trackerPulse {
          0% {
            transform: scale(1);
            opacity: 0.28;
          }
          100% {
            transform: scale(2.3);
            opacity: 0;
          }
        }
      `}</style>
    </section>
  );
}
