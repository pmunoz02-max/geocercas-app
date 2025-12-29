// src/pages/TrackerGpsPage.jsx
import { useEffect, useRef, useState } from "react";
import { supabaseTracker } from "../supabaseTrackerClient";

// ====== Config 5 minutos ======
const SERVER_MIN_INTERVAL_MS = 5 * 60 * 1000; // 300000
const CLIENT_MIN_INTERVAL_MS = 5 * 60 * 1000; // igual al server
// Intentamos cada 30s, pero el throttle manda (no spameamos)
const TICK_MS = 30_000;

export default function TrackerGpsPage() {
  const [status, setStatus] = useState("Iniciando tracker…");
  const [coords, setCoords] = useState(null);
  const [lastSend, setLastSend] = useState(null);
  const [lastError, setLastError] = useState(null);

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);

  const lastCoordsRef = useRef(null);
  const isSendingRef = useRef(false);
  const lastSentAtRef = useRef(0);

  // Edge Function está en Project A
  const A_URL = import.meta.env.VITE_SUPABASE_URL;
  const A_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const SEND_URL = A_URL ? `${A_URL}/functions/v1/send_position` : null;

  const log = (msg) => {
    const line = `${new Date().toISOString().slice(11, 19)} - ${msg}`;
    console.log("[TrackerGpsPage]", line);
  };

  // 1) Sesión Project B
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabaseTracker.auth.getSession();
      if (cancelled) return;

      if (error) {
        setStatus("Error obteniendo sesión tracker.");
        setLastError(error.message || String(error));
        log(`getSession(B) error: ${error.message || String(error)}`);
        return;
      }

      if (!data?.session) {
        setStatus("No hay sesión activa. Abre el tracker desde tu magic link.");
        setLastError("Sesión tracker no encontrada.");
        log("getSession(B): sin sesión");
        return;
      }

      setStatus("Sesión OK. Iniciando geolocalización…");
      setLastError(null);
      log(`getSession(B): OK email=${data.session.user.email}`);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2) GPS
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setStatus("Este dispositivo no soporta geolocalización.");
      setLastError("Geolocation no disponible.");
      return;
    }

    let cancelled = false;

    const handleSuccess = (pos) => {
      if (cancelled) return;

      const c = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
      };

      lastCoordsRef.current = c;
      setCoords(c);
      setStatus("Tracker activo");
      setLastError(null);
    };

    const handleError = (err) => {
      if (cancelled) return;
      setStatus("Error GPS");
      setLastError(err?.message || String(err));
      log(`GPS error: ${err?.message || String(err)} (code=${err?.code})`);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });

    return () => {
      cancelled = true;
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, []);

  // 3) Envío throttled (cada 5 min)
  useEffect(() => {
    if (!SEND_URL || !A_ANON) {
      setStatus("Config incompleta (Project A).");
      setLastError("Faltan env vars Project A (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
      return;
    }

    async function sendOnce() {
      const c = lastCoordsRef.current;
      if (!c) return;

      // throttle real 5 minutos
      const now = Date.now();
      const elapsed = now - lastSentAtRef.current;
      if (elapsed < CLIENT_MIN_INTERVAL_MS) {
        const remain = Math.ceil((CLIENT_MIN_INTERVAL_MS - elapsed) / 1000);
        setStatus(`Esperando ventana mínima… (${remain}s)`);
        return;
      }

      if (isSendingRef.current) return;
      isSendingRef.current = true;

      try {
        const { data: sData, error: sErr } = await supabaseTracker.auth.getSession();
        const tokenB = sData?.session?.access_token ?? null;

        if (sErr || !tokenB) {
          setStatus("Sesión tracker expirada. Reabre el magic link.");
          setLastError("Token tracker no disponible.");
          log(`No tokenB: ${sErr?.message || "sin sesión"}`);
          return;
        }

        const payload = {
          lat: c.lat,
          lng: c.lng,
          accuracy: c.accuracy,
          at: new Date().toISOString(),
          source: "tracker-gps-web",
        };

        const resp = await fetch(SEND_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: A_ANON,
            Authorization: `Bearer ${tokenB}`,
          },
          body: JSON.stringify(payload),
        });

        const json = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          if (resp.status === 429) {
            const retryMs =
              typeof json?.retry_after_ms === "number" ? json.retry_after_ms : SERVER_MIN_INTERVAL_MS;
            lastSentAtRef.current = Date.now() - (CLIENT_MIN_INTERVAL_MS - retryMs);
            setStatus("Esperando ventana mínima de envío…");
            setLastError("Frecuencia mínima entre posiciones");
            log(`429 rate limit. retry_after_ms=${retryMs}`);
            return;
          }

          const msg = json?.error || `HTTP ${resp.status}`;
          setStatus("Error al enviar la posición al servidor.");
          setLastError(`Edge Function: ${msg}`);
          log(`send_position NO-2xx: ${resp.status} - ${msg}`);
          return;
        }

        lastSentAtRef.current = Date.now();
        setStatus("Posición enviada correctamente.");
        setLastSend(new Date());
        setLastError(null);
        log("send_position OK");
      } catch (e) {
        setStatus("Error de red al enviar la posición.");
        setLastError(e?.message || String(e));
        log(`send_position exception: ${e?.message || String(e)}`);
      } finally {
        isSendingRef.current = false;
      }
    }

    intervalRef.current = window.setInterval(sendOnce, TICK_MS);

    return () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [SEND_URL, A_ANON]);

  const formattedLastSend = lastSend ? lastSend.toLocaleTimeString() : "—";
  const latText = coords?.lat != null ? coords.lat.toFixed(6) : "—";
  const lngText = coords?.lng != null ? coords.lng.toFixed(6) : "—";
  const accText = coords?.accuracy != null ? `${coords.accuracy.toFixed(1)} m` : "—";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-start justify-center px-3 py-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-sm p-4">
        <h1 className="text-lg font-semibold text-center">Tracker activo</h1>

        <div className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm">
          <div className="opacity-80">Lat: {latText}</div>
          <div className="opacity-80">Lng: {lngText}</div>
          <div className="opacity-80">Precisión: {accText}</div>
          <div className="opacity-80">Último envío: {formattedLastSend}</div>
        </div>

        <div className="mt-3 text-xs">
          <div className="text-slate-300">
            Estado: <span className="text-slate-100">{status}</span>
          </div>
          {lastError ? (
            <div className="mt-2 rounded-lg bg-red-950 border border-red-800 p-2 text-red-200">
              Error: {lastError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
