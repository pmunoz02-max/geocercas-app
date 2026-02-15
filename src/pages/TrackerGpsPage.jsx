import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseTracker } from "../supabaseTrackerClient";

// ====== Config 5 minutos ======
const SERVER_MIN_INTERVAL_MS = 5 * 60 * 1000;
const CLIENT_MIN_INTERVAL_MS = 5 * 60 * 1000;
const TICK_MS = 30_000;

export default function TrackerGpsPage() {
  const navigate = useNavigate();

  const [status, setStatus] = useState("Iniciando tracker…");
  const [coords, setCoords] = useState(null);
  const [lastSend, setLastSend] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [hasSession, setHasSession] = useState(true);

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastCoordsRef = useRef(null);
  const isSendingRef = useRef(false);
  const lastSentAtRef = useRef(0);

  // ✅ IMPORTANT: tokenB es Project B => endpoint y apikey deben ser Project B
  const B_URL =
    import.meta.env.VITE_SUPABASE_TRACKER_URL || import.meta.env.VITE_SUPABASE_URL;
  const B_ANON =
    import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY;

  const SEND_URL = B_URL ? `${String(B_URL).replace(/\/$/, "")}/functions/v1/send_position` : null;

  const log = (msg, extra) => {
    const line = `${new Date().toISOString().slice(11, 19)} - ${msg}`;
    console.log("[TrackerGpsPage]", line, extra || "");
  };

  // 1) Sesión Project B
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabaseTracker.auth.getSession();
      if (cancelled) return;

      if (error || !data?.session) {
        setHasSession(false);
        setStatus("No hay sesión activa de tracker.");
        setLastError("Abre esta página únicamente desde tu Magic Link.");
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
  }, []);

  // 2) GPS
  useEffect(() => {
    if (!hasSession) return;

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
  }, [hasSession]);

  // 3) Envío throttled (con diagnóstico real)
  useEffect(() => {
    if (!hasSession) return;

    if (!SEND_URL || !B_ANON) {
      setStatus("Error configuración");
      setLastError("Falta configuración tracker (URL/ANON) para send_position.");
      log("Missing env for send_position", { SEND_URL, hasAnon: !!B_ANON, B_URL });
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
        const tokenB = sData?.session?.access_token;

        if (sErr || !tokenB) {
          setStatus("No hay sesión activa");
          setLastError("Sesión expirada. Abre el Magic Link nuevamente.");
          log("sendOnce: no tokenB", { sErr });
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
            apikey: B_ANON,
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
          setLastError(`send_position ${resp.status}: ${j?.error || j?.message || text || "sin detalle"}`);
          log("send_position FAILED", { status: resp.status, body: j });
          return;
        }

        lastSentAtRef.current = Date.now();
        setLastSend(new Date());
        setStatus("Posición enviada correctamente.");
        setLastError(null);
        log("send_position OK", j);
      } catch (e) {
        setStatus("Error enviando posición");
        setLastError(String(e?.message || e));
        log("send_position EXCEPTION", { err: String(e?.message || e) });
      } finally {
        isSendingRef.current = false;
      }
    }

    // tick + primer envío inmediato
    intervalRef.current = window.setInterval(sendOnce, TICK_MS);
    sendOnce();

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [hasSession, SEND_URL, B_ANON]);

  const formattedLastSend = lastSend ? lastSend.toLocaleTimeString() : "—";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-start justify-center px-3 py-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-4">
        <h1 className="text-lg font-semibold text-center">Tracker activo</h1>

        {!hasSession && (
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-300 mb-3">
              Esta página es solo para trackers invitados.
            </p>
            <button
              onClick={() => navigate("/")}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-slate-950 font-semibold"
            >
              Ir a inicio
            </button>
          </div>
        )}

        {hasSession && (
          <>
            <div className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm">
              <div>Último envío: {formattedLastSend}</div>
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
