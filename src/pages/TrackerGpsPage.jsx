// src/pages/TrackerGpsPage.jsx
import { useEffect, useRef, useState } from "react";
import { supabaseTracker } from "../supabaseTrackerClient";

const CLIENT_SEND_INTERVAL_MS = 12_000;

export default function TrackerGpsPage() {
  const [status, setStatus] = useState("Iniciando tracker…");
  const [coords, setCoords] = useState(null);
  const [lastSend, setLastSend] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [debugLines, setDebugLines] = useState([]);

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastCoordsRef = useRef(null);

  // Edge Function está en Project A
  const A_URL = import.meta.env.VITE_SUPABASE_URL;
  const A_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const SEND_URL = A_URL ? `${A_URL}/functions/v1/send_position` : null;

  const log = (msg) => {
    const line = `${new Date().toISOString().slice(11, 19)} - ${msg}`;
    console.log("[TrackerGpsPage]", line);
    setDebugLines((prev) => {
      const next = [...prev, line];
      if (next.length > 20) next.shift();
      return next;
    });
  };

  // 1) Sesión en Project B
  useEffect(() => {
    let cancelled = false;

    (async () => {
      log("checkSession(B) → supabaseTracker.auth.getSession()");
      const { data, error } = await supabaseTracker.auth.getSession();
      if (cancelled) return;

      if (error) {
        setStatus("Error obteniendo sesión tracker.");
        setLastError(error.message || String(error));
        return;
      }

      if (!data?.session) {
        setStatus("No hay sesión activa. Abre el tracker desde tu magic link.");
        setLastError("Sesión tracker no encontrada.");
        return;
      }

      setStatus("Sesión OK. Iniciando geolocalización…");
      setLastError(null);
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
      log(`GPS ok lat=${c.lat.toFixed(6)} lng=${c.lng.toFixed(6)} acc=${c.accuracy}`);
    };

    const handleError = (err) => {
      if (cancelled) return;
      log(`GPS error: ${err?.message || String(err)} (code=${err?.code})`);
      setStatus("Error GPS");
      setLastError(err?.message || String(err));
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

  // 3) Envío a Project A con token B
  useEffect(() => {
    if (!SEND_URL || !A_ANON) {
      setStatus("Config incompleta (Project A).");
      setLastError("Faltan env vars Project A (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
      return;
    }

    async function sendOnce() {
      const c = lastCoordsRef.current;
      if (!c || isSending) return;

      setIsSending(true);

      try {
        const { data: sData, error: sErr } = await supabaseTracker.auth.getSession();
        const tokenB = sData?.session?.access_token ?? null;

        if (sErr || !tokenB) {
          setStatus("Sesión tracker expirada. Reabre el magic link.");
          setLastError("Token tracker no disponible.");
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
          const msg = json?.error || `HTTP ${resp.status}`;
          setStatus("Error al enviar la posición al servidor.");
          setLastError(`Edge Function: ${msg}`);
          log(`send_position NO-2xx: ${resp.status} - ${msg}`);
          return;
        }

        setStatus("Posición enviada correctamente.");
        setLastSend(new Date());
        setLastError(null);
        log(`send_position OK: ${JSON.stringify(json)}`);
      } catch (e) {
        setStatus("Error de red al enviar la posición.");
        setLastError(e?.message || String(e));
      } finally {
        setIsSending(false);
      }
    }

    intervalRef.current = window.setInterval(sendOnce, CLIENT_SEND_INTERVAL_MS);
    sendOnce();

    return () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [SEND_URL, A_ANON, isSending]);

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

        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-slate-300">Debug (solo pruebas)</summary>
          <div className="mt-2 rounded-xl bg-slate-950 border border-slate-800 p-2 text-[11px] text-slate-300 max-h-48 overflow-auto">
            {debugLines.length ? debugLines.map((l, i) => <div key={i}>{l}</div>) : <div>Sin logs…</div>}
          </div>
        </details>
      </div>
    </div>
  );
}
