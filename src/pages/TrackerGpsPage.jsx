// src/pages/TrackerGpsPage.jsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const CLIENT_SEND_INTERVAL_MS = 12_000; // >= 10s (límite de la Edge Function)

export default function TrackerGpsPage() {
  const [status, setStatus] = useState("Iniciando tracker…");
  const [coords, setCoords] = useState(null); // { lat, lng, accuracy }
  const [lastSend, setLastSend] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [isSending, setIsSending] = useState(false);

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastCoordsRef = useRef(null);

  // ---------------------------------------------------
  // 1) Comprobar sesión (para que solo funcione logueado)
  // ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (error) {
        console.error("[TrackerGpsPage] getSession error:", error);
        setStatus("Error obteniendo sesión.");
        setLastError(error.message || String(error));
        return;
      }

      if (!data?.session) {
        console.warn("[TrackerGpsPage] sin sesión activa");
        setStatus(
          "No hay sesión activa. Abre el tracker desde tu enlace de invitación."
        );
        setLastError("Sesión no encontrada.");
      } else {
        console.log(
          "[TrackerGpsPage] sesión OK, user_id:",
          data.session.user.id,
          "email:",
          data.session.user.email
        );
        setStatus("Sesión OK. Iniciando geolocalización…");
      }
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------
  // 2) Geolocalización con watchPosition (sin timeouts agresivos)
  // ---------------------------------------------------
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setStatus("Este dispositivo no soporta geolocalización.");
      setLastError("navigator.geolocation no está disponible en este navegador.");
      return;
    }

    let cancelled = false;

    const handleSuccess = (pos) => {
      if (cancelled) return;

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

      console.log("[TrackerGpsPage] posición recibida:", c);
    };

    const handleError = (err) => {
      if (cancelled) return;

      console.error("[TrackerGpsPage] error geolocalización:", err);

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
      setLastError(
        friendly ||
          `${err.message || String(err)} (código ${err.code ?? "?"})`
      );
    };

    setStatus("Solicitando permiso de ubicación…");

    const watchId = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      {
        enableHighAccuracy: true,
        // OJO: no ponemos timeout para no provocar "Timeout expired" desde nuestro código.
        // maximumAge: 0 fuerza a pedir una posición fresca cada vez que el SO pueda.
        maximumAge: 0,
      }
    );

    watchIdRef.current = watchId;

    return () => {
      cancelled = true;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  // ---------------------------------------------------
  // 3) Envío periódico de coordenadas a send_position
  // ---------------------------------------------------
  useEffect(() => {
    async function sendPositionOnce() {
      const c = lastCoordsRef.current;
      if (!c) {
        // Aún no hay coordenadas; no hacemos nada.
        console.log(
          "[TrackerGpsPage] sendPositionOnce: aún no hay coords, se espera…"
        );
        return;
      }

      setIsSending(true);

      const payload = {
        lat: c.lat,
        lng: c.lng,
        accuracy: c.accuracy,
        at: new Date().toISOString(),
        source: "tracker-gps-web",
      };

      console.log("[TrackerGpsPage] enviando → send_position:", payload);

      try {
        const { data, error } = await supabase.functions.invoke(
          "send_position",
          {
            body: payload,
          }
        );

        if (error) {
          console.error("[TrackerGpsPage] error send_position:", error);
          setStatus("Error al enviar la posición al servidor.");
          setLastError(error.message || String(error));
        } else {
          console.log("[TrackerGpsPage] respuesta send_position:", data);
          setStatus("Posición enviada correctamente.");
          setLastSend(new Date());
          setLastError(null);
        }
      } catch (e) {
        console.error("[TrackerGpsPage] excepción send_position:", e);
        setStatus("Error de red al enviar la posición.");
        setLastError(e.message || String(e));
      } finally {
        setIsSending(false);
      }
    }

    const id = setInterval(sendPositionOnce, CLIENT_SEND_INTERVAL_MS);
    intervalRef.current = id;

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------
  // Render UI
  // ---------------------------------------------------
  const formattedLastSend = lastSend
    ? lastSend.toLocaleTimeString()
    : "—";

  const latText =
    coords?.lat != null ? coords.lat.toFixed(6) : "—";
  const lngText =
    coords?.lng != null ? coords.lng.toFixed(6) : "—";
  const accText =
    coords?.accuracy != null ? `${coords.accuracy.toFixed(1)} m` : "—";

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
      </div>
    </div>
  );
}
