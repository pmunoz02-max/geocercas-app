import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseTracker } from "../lib/supabaseTrackerClient";

// ====== Config 5 minutos ======
const CLIENT_MIN_INTERVAL_MS = 5 * 60 * 1000;
const TICK_MS = 30_000;

export default function TrackerGpsPage() {
  const navigate = useNavigate();

  const [status, setStatus] = useState("Iniciando tracker…");
  const [coords, setCoords] = useState(null);
  const [lastSend, setLastSend] = useState(null);
  const [lastError, setLastError] = useState(null);

  const [hasSession, setHasSession] = useState(false);
  const [trackerReady, setTrackerReady] = useState(true); // false si faltan envs o supabaseTracker=null

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastCoordsRef = useRef(null);
  const isSendingRef = useRef(false);
  const lastSentAtRef = useRef(0);

  // ✅ PERMANENTE: Tracker SIEMPRE usa Project B. Nunca fallback a Project A.
  const TRACKER_URL = (import.meta.env.VITE_SUPABASE_TRACKER_URL || "").trim();
  const TRACKER_ANON = (import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY || "").trim();

  const sendUrl = useMemo(() => {
    if (!TRACKER_URL) return null;
    return `${TRACKER_URL.replace(/\/$/, "")}/functions/v1/send_position`;
  }, [TRACKER_URL]);

  const log = (msg, extra) => {
    const line = `${new Date().toISOString().slice(11, 19)} - ${msg}`;
    console.log("[TrackerGpsPage]", line, extra || "");
  };

  // 0) Validación de config del Tracker (universal)
  useEffect(() => {
    if (!supabaseTracker) {
      setTrackerReady(false);
      setHasSession(false);
      setStatus("Tracker no configurado en este deployment.");
      setLastError(
        "Faltan variables VITE_SUPABASE_TRACKER_URL / VITE_SUPABASE_TRACKER_ANON_KEY en Vercel (Preview)."
      );
      log("supabaseTracker is null (missing env)", {
        hasTrackerUrl: !!TRACKER_URL,
        hasTrackerAnon: !!TRACKER_ANON,
      });
      return;
    }

    if (!TRACKER_URL || !TRACKER_ANON) {
      setTrackerReady(false);
      setHasSession(false);
      setStatus("Tracker no configurado en este deployment.");
      setLastError(
        "Faltan variables VITE_SUPABASE_TRACKER_URL / VITE_SUPABASE_TRACKER_ANON_KEY en Vercel (Preview)."
      );
      log("tracker env missing", { hasTrackerUrl: !!TRACKER_URL, hasTrackerAnon: !!TRACKER_ANON });
      return;
    }

    setTrackerReady(true);
  }, [TRACKER_URL, TRACKER_ANON]);

  // 1) Sesión Project B (Tracker)
  useEffect(() => {
    if (!trackerReady || !supabaseTracker) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabaseTracker.auth.getSession();
      if (cancelled) return;

      if (error || !data?.session) {
        setHasSession(false);
        setStatus("No hay sesión activa de tracker.");
        setLastError("Abre esta página únicamente desde tu Magic Link del Tracker.");
        log("getSession(B): sin sesión", { error });
        return;
      }

      setHasSession(true);
      setStatus("Sesión OK. Iniciando geolocalización…");
      setLastError(null);
      log("getSession(B): OK", { email: data.session.user.email });
    })();

    return () => {
      cancelled = true;
    };
  }, [trackerReady]);

  // 2) GPS
  useEffect(() => {
    if (!trackerReady || !hasSession) return;

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
      log("GPS error", { err: err?.message || String(err) });
    };

    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });

    return () => {
      cancelled = true;
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [trackerReady, hasSession]);

  // 3) Envío throttled (SIEMPRE hacia Project B)
  useEffect(() => {
    if (!trackerReady || !hasSession) return;
    if (!supabaseTracker) return;

    if (!sendUrl) {
      setStatus("Error configuración");
      setLastError("No se pudo construir SEND_URL del tracker.");
      log("Missing sendUrl", { TRACKER_URL });
      return;
    }

    async function sendOnce() {
      const c = lastCoordsRef.current;
      if (!c) return;

      const now = Date.now();
      if (now - lastSentAtRef.current < CLIENT_MIN_INTERVAL_MS) return;
      if (isSendingRef.current) return;

      isSendingRef.current = true;

      try {
        const { data: sData, error: sErr } = await supabaseTracker.auth.getSession();
        const tokenB = sData?.session?.access_token || "";

        if (sErr || !tokenB) {
          setStatus("No hay sesión activa");
          setLastError("Sesión expirada. Abre el Magic Link nuevamente.");
          log("sendOnce: no tokenB", { sErr });
          setHasSession(false);
          return;
        }

        const payload = {
          lat: c.lat,
          lng: c.lng,
          accuracy: c.accuracy,
          at: new Date().toISOString(),
          source: "tracker-gps-web",
        };

        const resp = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: TRACKER_ANON,
            Authorization: `Bearer ${tokenB}`,
          },
          body: JSON.stringify(payload),
        });

        const text = await resp.text();
        let j = null;
        try {
          j = text ? JSON.parse(text) : null;
        } catch {
          j = { raw: text };
        }

        if (!resp.ok) {
          setStatus("Error enviando posición");
          setLastError(
            `send_position ${resp.status}: ${j?.error || j?.message || j?.raw || "sin detalle"}`
          );
          log("send_position FAILED", { status: resp.status, body: j, sendUrl });
          return;
        }

        lastSentAtRef.current = Date.now();
        setLastSend(new Date());
        setStatus("Posición enviada correctamente.");
        setLastError(null);
        log("send_position OK", { sendUrl, body: j });
      } catch (e) {
        setStatus("Error enviando posición");
        setLastError(String(e?.message || e));
        log("send_position EXCEPTION", { err: String(e?.message || e), sendUrl });
      } finally {
        isSendingRef.current = false;
      }
    }

    intervalRef.current = window.setInterval(sendOnce, TICK_MS);
    sendOnce();

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [trackerReady, hasSession, sendUrl, TRACKER_ANON]);

  const formattedLastSend = lastSend ? lastSend.toLocaleTimeString() : "—";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-start justify-center px-3 py-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-4">
        <h1 className="text-lg font-semibold text-center">Tracker GPS</h1>

        {!trackerReady && (
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-300 mb-3">
              Tracker no configurado en este deployment.
            </p>
            <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-xl p-3 text-left">
              {lastError}
            </div>
            <button
              onClick={() => navigate("/")}
              className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-slate-950 font-semibold"
            >
              Ir a inicio
            </button>
          </div>
        )}

        {trackerReady && !hasSession && (
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-300 mb-3">
              Esta página es solo para trackers invitados.
            </p>
            {lastError ? (
              <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-xl p-3 text-left">
                {lastError}
              </div>
            ) : null}
            <button
              onClick={() => navigate("/")}
              className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-slate-950 font-semibold"
            >
              Ir a inicio
            </button>
          </div>
        )}

        {trackerReady && hasSession && (
          <>
            <div className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm">
              <div>Último envío: {formattedLastSend}</div>
              <div className="mt-2 text-[11px] text-slate-400 break-all">
                send_url: {sendUrl || "—"}
              </div>
              {coords ? (
                <div className="mt-2 text-xs text-slate-300">
                  lat: {coords.lat?.toFixed?.(6)} | lng: {coords.lng?.toFixed?.(6)} | acc:{" "}
                  {coords.accuracy ?? "—"}
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-400">Esperando coordenadas…</div>
              )}
            </div>

            <div className="mt-3 text-xs">
              Estado: <span className="text-slate-100">{status}</span>
            </div>

            {lastError ? (
              <div className="mt-3 text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-xl p-3">
                {lastError}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
