import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * Tracker GPS – Web/TWA
 * Autenticación vía backend (/api/auth/session)
 * NO usa supabase.auth en frontend
 */

const CLIENT_MIN_INTERVAL_MS = 5 * 60 * 1000;
const TICK_MS = 30_000;

export default function TrackerGpsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [status, setStatus] = useState("Iniciando tracker…");
  const [coords, setCoords] = useState(null);
  const [lastSend, setLastSend] = useState(null);
  const [lastError, setLastError] = useState(null);

  const [loading, setLoading] = useState(true);
  const [isTracker, setIsTracker] = useState(false);

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastCoordsRef = useRef(null);
  const isSendingRef = useRef(false);
  const lastSentAtRef = useRef(0);

  const tgFlow = params.get("tg_flow") === "tracker";

  // === 1) Validar sesión vía BACKEND (cookies HttpOnly)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
          headers: { "cache-control": "no-cache" },
        });

        const data = await res.json();

        if (cancelled) return;

        if (!res.ok || !data?.authenticated) {
          setIsTracker(false);
          setStatus("No hay sesión válida.");
          return;
        }

        const role = String(data.currentRole || "").toLowerCase();

        if (role !== "tracker") {
          setIsTracker(false);
          setStatus("Usuario no es tracker.");
          return;
        }

        setIsTracker(true);
        setStatus("Sesión tracker OK. Iniciando GPS…");
      } catch (e) {
        setIsTracker(false);
        setLastError("Error validando sesión.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // === 2) GPS
  useEffect(() => {
    if (!isTracker) return;

    if (!("geolocation" in navigator)) {
      setStatus("Este dispositivo no soporta geolocalización.");
      setLastError("Geolocation no disponible.");
      return;
    }

    const handleSuccess = (pos) => {
      const c = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
      };
      lastCoordsRef.current = c;
      setCoords(c);
      setStatus("Tracker activo");
    };

    const handleError = (err) => {
      setStatus("Error GPS");
      setLastError(err?.message || String(err));
    };

    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isTracker]);

  // === 3) Envío throttled (usa cookies + backend)
  useEffect(() => {
    if (!isTracker) return;

    async function sendOnce() {
      const c = lastCoordsRef.current;
      if (!c) return;

      const now = Date.now();
      if (now - lastSentAtRef.current < CLIENT_MIN_INTERVAL_MS) return;
      if (isSendingRef.current) return;

      isSendingRef.current = true;

      try {
        const resp = await fetch("/api/tracker/send-position", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: c.lat,
            lng: c.lng,
            accuracy: c.accuracy,
            at: new Date().toISOString(),
            source: "tracker-gps-web",
          }),
        });

        if (resp.ok) {
          lastSentAtRef.current = Date.now();
          setLastSend(new Date());
          setStatus("Posición enviada correctamente.");
        }
      } finally {
        isSendingRef.current = false;
      }
    }

    intervalRef.current = window.setInterval(sendOnce, TICK_MS);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [isTracker]);

  const formattedLastSend = lastSend ? lastSend.toLocaleTimeString() : "—";

  // === UI
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        Cargando tracker…
      </div>
    );
  }

  if (!isTracker) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-3">
        <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-slate-800 p-6 text-center">
          <h1 className="text-lg font-semibold">Tracker activo</h1>
          <p className="mt-3 text-sm text-slate-300">
            Esta página es solo para trackers invitados.
          </p>
          <button
            onClick={() => navigate("/inicio")}
            className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-slate-950 font-semibold"
          >
            Ir a inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-start justify-center px-3 py-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-4">
        <h1 className="text-lg font-semibold text-center">Tracker activo</h1>

        <div className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm">
          <div>Lat: {coords?.lat ?? "—"}</div>
          <div>Lng: {coords?.lng ?? "—"}</div>
          <div>Precisión: {coords?.accuracy ? `${coords.accuracy.toFixed(1)} m` : "—"}</div>
          <div>Último envío: {formattedLastSend}</div>
        </div>

        <div className="mt-3 text-xs">
          Estado: <span className="text-slate-100">{status}</span>
        </div>

        {lastError && (
          <div className="mt-2 text-xs text-red-400">
            Error: {lastError}
          </div>
        )}
      </div>
    </div>
  );
}
