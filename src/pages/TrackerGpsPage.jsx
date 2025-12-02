// src/pages/TrackerGpsPage.jsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

// Intervalo de envío desde el cliente.
// Debe ser >= MIN_INTERVAL_MS de la función (10s) para evitar 429.
const CLIENT_SEND_INTERVAL_MS = 12_000;

export default function TrackerGpsPage() {
  const [status, setStatus] = useState("Iniciando tracker…");
  const [coords, setCoords] = useState(null); // { lat, lng, accuracy }
  const [lastSend, setLastSend] = useState(null); // fecha/hora último envío ok
  const [lastError, setLastError] = useState(null);
  const [isSending, setIsSending] = useState(false);

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastCoordsRef = useRef(null);

  // ---------------------------------------------------
  // 1) Obtener sesión (para saber si el tracker está logueado)
  // ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("[TrackerGpsPage] error getSession:", error);
        if (!cancelled) {
          setStatus("Error obteniendo sesión");
          setLastError(error.message || String(error));
        }
        return;
      }
      if (!data?.session) {
        console.warn("[TrackerGpsPage] NO hay sesión activa");
        if (!cancelled) {
          setStatus("No hay sesión activa. Abre el tracker desde el enlace de invitación.");
          setLastError("Sesión nula: el usuario no está autenticado");
        }
      } else {
        console.log(
          "[TrackerGpsPage] sesión OK, user_id:",
          data.session.user.id,
          "email:",
          data.session.user.email
        );
        if (!cancelled) {
          setStatus("Sesión OK. Iniciando geolocalización…");
        }
      }
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------
  // 2) Iniciar geolocalización del navegador
  // ---------------------------------------------------
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setStatus("Este dispositivo no soporta geolocalización.");
      return;
    }

    setStatus("Solicitando permiso de ubicación…");

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const c = {
          lat: latitude,
          lng: longitude,
          accuracy: accuracy ?? null,
        };
        lastCoordsRef.current = c;
        setCoords(c);
        setStatus("Tracker activo. Ubicación obtenida.");
        // No enviamos aquí directamente, dejamos que lo haga el intervalo.
      },
      (err) => {
        console.error("[TrackerGpsPage] error geolocalización:", err);
        setStatus("No se pudo obtener la ubicación.");
        setLastError(err.message || String(err));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 20_000,
      }
    );

    watchIdRef.current = watchId;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------
  // 3) Enviar posición periódicamente a la Edge Function
  // ---------------------------------------------------
  useEffect(() => {
    async function sendPositionOnce() {
      const c = lastCoordsRef.current;
      if (!c) {
        // Aún no hay coordenadas
        return;
      }

      setIsSending(true);
      setLastError(null);

      const payload = {
        lat: c.lat,
        lng: c.lng,
        accuracy: c.accuracy,
        at: new Date().toISOString(),
        source: "tracker-gps-page",
      };

      console.log("[TrackerGpsPage] enviando posición → send_position:", payload);

      try {
        const { data, error } = await supabase.functions.invoke(
          "send_position",
          {
            body: payload,
          }
        );

        if (error) {
          console.error("[TrackerGpsPage] error invoke send_position:", error);
          setLastError(error.message || String(error));
          setStatus("Error al enviar posición al servidor.");
        } else {
          console.log("[TrackerGpsPage] respuesta send_position:", data);
          setStatus("Posición enviada correctamente.");
          setLastSend(new Date());
        }
      } catch (e) {
        console.error("[TrackerGpsPage] excepción invoke send_position:", e);
        setLastError(e.message || String(e));
        setStatus("Error de red al enviar posición.");
      } finally {
        setIsSending(false);
      }
    }

    // Intervalo periódico
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
        background: "radial-gradient(circle at top, #243b53 0, #111827 55%, #020617 100%)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        color: "#e5e7eb",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
          Mantén esta pantalla abierta. Tu ubicación se enviará automáticamente mientras te mueves.
          El sistema registra todos los puntos para el dashboard, y usa especialmente los que están
          dentro de las geocercas asignadas a tu usuario.
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
            Puedes bloquear la pantalla; mientras esta página esté abierta en segundo plano y el GPS
            siga activo, seguiremos recibiendo tus posiciones (según cobertura y batería).
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
