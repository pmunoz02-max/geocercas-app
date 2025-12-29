// src/pages/TrackerGpsPage.jsx
import { useEffect, useRef, useState } from "react";
import { supabaseTracker } from "../supabaseTrackerClient";

const CLIENT_SEND_INTERVAL_MS = 12_000; // >= 10s (límite de la Edge Function)

export default function TrackerGpsPage() {
  const [status, setStatus] = useState("Iniciando tracker…");
  const [coords, setCoords] = useState(null); // { lat, lng, accuracy }
  const [lastSend, setLastSend] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [debugLines, setDebugLines] = useState([]);

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastCoordsRef = useRef(null);

  // Endpoint Project A (Edge Function vive en A)
  const A_URL = import.meta.env.VITE_SUPABASE_URL;
  const A_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const SEND_URL = A_URL ? `${A_URL}/functions/v1/send_position` : null;

  // Helper para log
  const log = (msg) => {
    const line = `${new Date().toISOString().slice(11, 19)} - ${msg}`;
    console.log("[TrackerGpsPage]", line);
    setDebugLines((prev) => {
      const next = [...prev, line];
      if (next.length > 20) next.shift();
      return next;
    });
  };

  // ---------------------------------------------------
  // 1) Comprobar sesión (Project B)
  // ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    log("useEffect[session] start");

    async function checkSession() {
      log("checkSession(B) → supabaseTracker.auth.getSession()");
      const { data, error } = await supabaseTracker.auth.getSession();
      if (cancelled) {
        log("checkSession cancelled");
        return;
      }

      if (error) {
        log(`checkSession(B) error: ${error.message || String(error)}`);
        setStatus("Error obteniendo sesión tracker.");
        setLastError(error.message || String(error));
        return;
      }

      if (!data?.session) {
        log("checkSession(B): SIN sesión");
        setStatus("No hay sesión activa. Abre el tracker desde tu enlace de invitación.");
        setLastError("Sesión tracker no encontrada.");
      } else {
        log(`checkSession(B): sesión OK, email=${data.session.user.email}`);
        setStatus("Sesión OK. Iniciando geolocalización…");
        setLastError(null);
      }
    }

    checkSession();

    return () => {
      cancelled = true;
      log("useEffect[session] cleanup");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------
  // 2) Geolocalización con watchPosition
  // ---------------------------------------------------
  useEffect(() => {
    log("useEffect[geo] start");

    if (!("geolocation" in navigator)) {
      log("navigator.geolocation NO disponible");
      setStatus("Este dispositivo no soporta geolocalización.");
      setLastError("navigator.geolocation no está disponible en este navegador.");
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      try {
        navigator.permissions
          .query({ name: "geolocation" })
          .then((result) => {
            log(`Permissions API: geolocation state='${result.state}'`);
          })
          .catch((e) => {
            log(`Permissions API error: ${e?.message || String(e)}`);
          });
      } catch (e) {
        log(`Permissions API exception: ${e?.message || String(e)}`);
      }
    } else {
      log("Permissions API no disponible");
    }

    let cancelled = false;

    const handleSuccess = (pos) => {
      if (cancelled) {
        log("handleSuccess llamado pero efecto cancelado");
        return;
      }

      const { latitude, longitude, accuracy } = pos.coords;
      const c = {
        lat: latitude,
        lng: longitude,
        accuracy: accuracy ?? null,
      };

      lastCoordsRef.current = c;
      setCoords(c);
      setStatus("Tracker activo. Ubicación actualizada.");
      setLastError(null);

      log(`handleSuccess: lat=${c.lat.toFixed(6)}, lng=${c.lng.toFixed(6)}, acc=${c.accuracy}`);
    };

    const handleError = (err) => {
      if (cancelled) {
        log("handleError llamado pero efecto cancelado");
        return;
      }

      log(`handleError: code=${err.code}, message='${err.message || String(err)}'`);

      let friendly = "";
      if (err.code === 1) {
        friendly =
          "Tu teléfono está bloqueando la ubicación para este sitio. Activa la ubicación en Ajustes > Aplicaciones > Navegador > Permisos > Ubicación.";
      } else if (err.code === 2) {
        friendly =
          "No se pudo obtener la ubicación. Revisa que el GPS esté encendido y que tengas señal.";
      } else if (err.code === 3) {
        friendly =
          "La ubicación tardó demasiado en actualizarse. Si continúa, revisa permisos de GPS.";
      }

      setStatus("No se pudo obtener la ubicación.");
      setLastError(friendly || `${err.message || String(err)} (código ${err.code ?? "?"})`);
    };

    setStatus("Solicitando permiso de ubicación…");
    log("Antes de watchPosition");

    let watchId;
    try {
      watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
        enableHighAccuracy: true,
        maximumAge: 0,
      });
      watchIdRef.current = watchId;
      log(`watchPosition iniciado, watchId=${watchId}`);
    } catch (e) {
      log(`Exception al llamar watchPosition: ${e?.message || String(e)}`);
      setStatus("Error al iniciar la geolocalización.");
      setLastError(e?.message || String(e));
    }

    return () => {
      cancelled = true;
      log("useEffect[geo] cleanup");
      if (watchIdRef.current !== null) {
        log(`clearWatch(${watchIdRef.current})`);
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------
  // 3) Envío periódico a send_position (Edge Function en Project A)
  //    Authorization = token del Project B
  // ---------------------------------------------------
  useEffect(() => {
    log("useEffect[send] start");

    if (!SEND_URL || !A_ANON) {
      log("Faltan env vars VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (Project A)");
      setStatus("Config incompleta (Project A).");
      setLastError("Faltan env vars del Project A (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
      return;
    }

    async function sendPositionOnce() {
      const c = lastCoordsRef.current;
      if (!c) {
        log("sendPositionOnce: aún no hay coords, se espera…");
        return;
      }
      if (isSending) return;

      setIsSending(true);

      const payload = {
        lat: c.lat,
        lng: c.lng,
        accuracy: c.accuracy,
        at: new Date().toISOString(),
        source: "tracker-gps-web",
      };

      log(`sendPositionOnce: enviando lat=${c.lat}, lng=${c.lng}, acc=${c.accuracy}`);

      try {
        // token del Project B
        const { data: sData, error: sErr } = await supabaseTracker.auth.getSession();
        const tokenB = sData?.session?.access_token ?? null;

        if (sErr || !tokenB) {
          log(`No tokenB: ${sErr?.message || "sin sesión"}`);
          setStatus("Sesión tracker expirada. Reabre el magic link.");
          setLastError("Token tracker no disponible.");
          return;
        }

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
          log(`send_position NO-2xx: ${resp.status} - ${msg}`);
          setStatus("Error al enviar la posición al servidor.");
          setLastError(`Edge Function: ${msg}`);
          return;
        }

        log(`send_position OK: ${JSON.stringify(json)}`);
        setStatus("Posición enviada correctamente.");
        setLastSend(new Date());
        setLastError(null);
      } catch (e) {
        log(`send_position excepción: ${e?.message || String(e)}`);
        setStatus("Error de red al enviar la posición.");
        setLastError(e?.message || String(e));
      } finally {
        setIsSending(false);
      }
    }

    const id = window.setInterval(sendPositionOnce, CLIENT_SEND_INTERVAL_MS);
    intervalRef.current = id;
    log(`Intervalo de envío creado, id=${id}`);

    // envío inmediato
    sendPositionOnce();

    return () => {
      log("useEffect[send] cleanup");
      if (intervalRef.current !== null) {
        log(`clearInterval(${intervalRef.current})`);
        window.clearInterval(intervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SEND_URL, A_ANON, isSending]);

  // ---------------------------------------------------
  // Render UI
  // ---------------------------------------------------
  const formattedLastSend = lastSend ? lastSend.toLocaleTimeString() : "—";
  const latText = coords?.lat != null ? coords.lat.toFixed(6) : "—";
  const lngText = coords?.lng != null ? coords.lng.toFixed(6) : "—";
  const accText = coords?.accuracy != null ? `${coords.accuracy.toFixed(1)} m` : "—";

  return (
    <div
      style={{
        minHeight: "100vh",
        margin: 0,
        padding: "16px",
        background:
          "radial-gradient(circle at top, #243b53 0, #111827 55%, #020617 100%)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        color: "#e5e7eb",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          background: "rgba(15, 23, 42, 0.92)",
          borderRadius: 24,
          padding: 24,
          boxShadow: "0 20px 45px rgba(0,0,0,0.55)",
          border: "1px solid rgba(148, 163, 184, 0.25)",
        }}
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          Tracker activo
        </h1>

        <p
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            textAlign: "center",
            color: "#cbd5f5",
            marginBottom: 18,
          }}
        >
          Mantén esta pantalla abierta. Tu ubicación se enviará automáticamente
          mientras te mueves. El sistema registra todos los puntos para el
          dashboard y usa especialmente los que están dentro de las geocercas
          asignadas a tu usuario.
        </p>

        <div
          style={{
            background: "rgba(15, 23, 42, 0.85)",
            borderRadius: 16,
            padding: 16,
            border: "1px solid rgba(148,163,184,0.35)",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            <div>
              <span style={{ color: "#9ca3af" }}>Lat:</span>{" "}
              <span>{latText}</span>
            </div>
            <div>
              <span style={{ color: "#9ca3af" }}>Lng:</span>{" "}
              <span>{lngText}</span>
            </div>
            <div>
              <span style={{ color: "#9ca3af" }}>Precisión:</span>{" "}
              <span>{accText}</span>
            </div>
            <div>
              <span style={{ color: "#9ca3af" }}>Último envío:</span>{" "}
              <span>{formattedLastSend}</span>
            </div>
          </div>

          <p
            style={{
              fontSize: 11,
              color: "#9ca3af",
              marginTop: 12,
            }}
          >
            Puedes bloquear la pantalla; mientras esta página esté abierta y el
            GPS siga activo, seguiremos recibiendo tus posiciones (según
            cobertura y batería).
          </p>
        </div>

        <div
          style={{
            fontSize: 12,
            marginBottom: 8,
            color: isSending ? "#a5b4fc" : "#bbf7d0",
          }}
        >
          {status}
        </div>

        {lastError && (
          <div
            style={{
              fontSize: 11,
              color: "#fecaca",
              background: "rgba(127,29,29,0.35)",
              borderRadius: 12,
              padding: 8,
              border: "1px solid rgba(248,113,113,0.4)",
              marginTop: 4,
            }}
          >
            <strong>Error:</strong> {lastError}
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            paddingTop: 8,
            borderTop: "1px dashed rgba(148,163,184,0.35)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#9ca3af",
              marginBottom: 4,
            }}
          >
            Debug (solo pruebas):
          </div>
          <pre
            style={{
              maxHeight: 140,
              overflowY: "auto",
              fontSize: 10,
              background: "rgba(15,23,42,0.7)",
              borderRadius: 8,
              padding: 8,
              border: "1px solid rgba(51,65,85,0.8)",
              whiteSpace: "pre-wrap",
            }}
          >
            {debugLines.join("\n") || "Sin registros todavía…"}
          </pre>
        </div>
      </div>
    </div>
  );
}
