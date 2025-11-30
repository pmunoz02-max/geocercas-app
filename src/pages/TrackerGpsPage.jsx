// src/pages/TrackerGpsPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

export default function TrackerGpsPage() {
  const navigate = useNavigate();
  const { currentRole } = useAuth();

  const [roleStatus, setRoleStatus] = useState("unknown"); // unknown | allowed | denied
  const [status, setStatus] = useState("init"); // init | requesting | tracking | error
  const [error, setError] = useState("");
  const [coords, setCoords] = useState(null);

  // 1) Comprobar rol: SOLO "tracker" puede estar aquí
  useEffect(() => {
    // Todavía no sabemos el rol (AuthContext cargando)
    if (currentRole == null) return;

    if (currentRole !== "tracker") {
      setRoleStatus("denied");
      // Cualquier otro rol se manda al dashboard interno
      navigate("/inicio", { replace: true });
    } else {
      setRoleStatus("allowed");
    }
  }, [currentRole, navigate]);

  // 2) Si el rol es "tracker", arrancar sesión + geolocalización
  useEffect(() => {
    if (roleStatus !== "allowed") return;

    let watchId = null;

    async function start() {
      try {
        // Asegurarnos de que hay sesión (debería venir del Magic Link)
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("[TrackerGps] getSession error:", sessionError);
        }

        if (!session) {
          setStatus("error");
          setError(
            "No hay sesión activa.\nAbre este enlace directamente desde el correo que recibiste."
          );
          return;
        }

        if (!("geolocation" in navigator)) {
          setStatus("error");
          setError("Este dispositivo no soporta geolocalización.");
          return;
        }

        setStatus("requesting");

        watchId = navigator.geolocation.watchPosition(
          async (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            setCoords({ latitude, longitude, accuracy });
            setStatus("tracking");

            try {
              // Envía la posición a tu Edge Function de backend
              const { error: fnError } = await supabase.functions.invoke(
                "send_position",
                {
                  body: {
                    lat: latitude,
                    lng: longitude,
                    accuracy,
                    // Puedes agregar más campos si tu función los usa
                    source: "tracker-magic-link",
                  },
                }
              );

              if (fnError) {
                console.error("[TrackerGps] error al enviar posición:", fnError);
              }
            } catch (err) {
              console.error("[TrackerGps] excepción al enviar posición:", err);
            }
          },
          (geoError) => {
            console.error("[TrackerGps] geolocation error:", geoError);
            let msg = "No se pudo obtener tu ubicación.";
            if (geoError.code === geoError.PERMISSION_DENIED) {
              msg =
                "No se pudo obtener tu ubicación.\nDebes permitir el acceso al GPS.";
            }
            setStatus("error");
            setError(msg);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 10_000,
            timeout: 20_000,
          }
        );
      } catch (e) {
        console.error("[TrackerGps] excepción general:", e);
        setStatus("error");
        setError("Ocurrió un error al iniciar el tracker.");
      }
    }

    start();

    // Limpieza al salir de la página
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [roleStatus]);

  // UI
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white px-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800/80 border border-slate-700 p-6 text-center shadow-lg">
        <h1 className="text-xl font-semibold mb-2">Tracker activo</h1>
        <p className="text-sm text-slate-300 mb-4">
          Mantén esta pantalla abierta. Tu ubicación se enviará automáticamente
          mientras te muevas. El sistema solo usa los puntos que estén dentro
          de las geocercas asignadas a tu usuario.
        </p>

        {roleStatus === "unknown" && (
          <p className="text-sm text-slate-400">
            Verificando permisos de acceso…
          </p>
        )}

        {roleStatus === "allowed" && status === "init" && (
          <p className="text-sm text-slate-400">Iniciando…</p>
        )}

        {roleStatus === "allowed" && status === "requesting" && (
          <p className="text-sm text-slate-400">
            Esperando permiso de ubicación…
          </p>
        )}

        {roleStatus === "allowed" && status === "tracking" && coords && (
          <div className="mt-2 text-left bg-slate-900/60 rounded-xl p-3 text-xs">
            <p className="font-mono">
              Lat: {coords.latitude.toFixed(6)}
              <br />
              Lng: {coords.longitude.toFixed(6)}
              <br />
              Precisión: {Math.round(coords.accuracy)} m
            </p>
            <p className="mt-2 text-[11px] text-slate-400">
              Puedes bloquear la pantalla; mientras esta página esté abierta en
              segundo plano y el GPS siga activo, seguiremos recibiendo tus
              posiciones.
            </p>
          </div>
        )}

        {roleStatus === "allowed" && status === "error" && (
          <p className="mt-2 text-sm text-red-400 whitespace-pre-line">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
