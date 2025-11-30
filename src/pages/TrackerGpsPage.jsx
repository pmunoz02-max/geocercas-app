// src/pages/TrackerGpsPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function TrackerGpsPage() {
  const navigate = useNavigate();

  // "checking" | "requesting" | "tracking" | "error" | "no-session" | "not-tracker"
  const [phase, setPhase] = useState("checking");
  const [error, setError] = useState("");
  const [coords, setCoords] = useState(null);

  // 1) Validar sesión y rol directamente con Supabase (SIN AuthContext)
  useEffect(() => {
    let active = true;

    const checkSessionAndRole = async () => {
      try {
        setPhase("checking");

        // Sesión actual
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("[TrackerGps] getSession error:", sessionError);
        }

        if (!session) {
          if (!active) return;
          setPhase("no-session");
          setError(
            "No hay sesión activa.\nAbre este enlace directamente desde el correo que recibiste."
          );
          setTimeout(() => {
            navigate("/login", { replace: true });
          }, 1500);
          return;
        }

        // Leer rol desde user_roles_view
        const { data: rows, error: roleErr } = await supabase
          .from("user_roles_view")
          .select("role_name")
          .limit(1);

        if (roleErr) {
          console.warn("[TrackerGps] error user_roles_view:", roleErr);
        }

        const role =
          rows && rows.length > 0
            ? String(rows[0].role_name || "").toLowerCase()
            : "";

        console.log("[TrackerGps] rol detectado:", role);

        if (!active) return;

        if (role !== "tracker") {
          setPhase("not-tracker");
          setError(
            "Este enlace es exclusivo para usuarios con rol TRACKER.\nSerás redirigido al panel principal."
          );
          setTimeout(() => {
            navigate("/inicio", { replace: true });
          }, 1500);
          return;
        }

        // ✅ Es tracker → pasamos a la fase de geolocalización
        setPhase("requesting");
      } catch (e) {
        console.error("[TrackerGps] excepción en checkSessionAndRole:", e);
        if (!active) return;
        setPhase("error");
        setError("Ocurrió un error al validar tu sesión. Intenta de nuevo.");
      }
    };

    checkSessionAndRole();

    return () => {
      active = false;
    };
  }, [navigate]);

  // 2) Si el rol ES tracker (phase === "requesting"), iniciar geolocalización
  useEffect(() => {
    if (phase !== "requesting") return;

    if (!("geolocation" in navigator)) {
      setPhase("error");
      setError("Este dispositivo no soporta geolocalización.");
      return;
    }

    let watchId = null;

    const startWatch = async () => {
      try {
        watchId = navigator.geolocation.watchPosition(
          async (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            setCoords({ latitude, longitude, accuracy });
            setPhase("tracking");

            try {
              // Envía la posición a tu Edge Function de backend
              const { error: fnError } = await supabase.functions.invoke(
                "send_position",
                {
                  body: {
                    lat: latitude,
                    lng: longitude,
                    accuracy,
                    source: "tracker-magic-link",
                  },
                }
              );

              if (fnError) {
                console.error(
                  "[TrackerGps] error al enviar posición:",
                  fnError
                );
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
            setPhase("error");
            setError(msg);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 10_000,
            timeout: 20_000,
          }
        );
      } catch (e) {
        console.error("[TrackerGps] excepción general en geolocalización:", e);
        setPhase("error");
        setError("Ocurrió un error al iniciar el tracker.");
      }
    };

    startWatch();

    // Limpieza al salir de la página
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [phase]);

  // ---------------- UI ----------------
  const renderMessage = () => {
    if (phase === "checking") {
      return "Verificando tu sesión y permisos…";
    }
    if (phase === "requesting") {
      return "Esperando permiso de ubicación…";
    }
    if (phase === "tracking") {
      return "Tu ubicación se está enviando automáticamente a tu organización.";
    }
    if (phase === "no-session") {
      return "No hay sesión activa.";
    }
    if (phase === "not-tracker") {
      return "Este enlace es solo para usuarios TRACKER.";
    }
    if (phase === "error") {
      return "Se produjo un problema.";
    }
    return "";
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white px-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800/80 border border-slate-700 p-6 text-center shadow-lg">
        <h1 className="text-xl font-semibold mb-2">Tracker activo</h1>
        <p className="text-sm text-slate-300 mb-4">
          Mantén esta pantalla abierta. Tu ubicación se enviará
          automáticamente mientras te muevas. El sistema solo usa los puntos que
          estén dentro de las geocercas asignadas a tu usuario.
        </p>

        <p className="text-sm text-slate-200 mb-3 whitespace-pre-line">
          {renderMessage()}
        </p>

        {phase === "tracking" && coords && (
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

        {phase === "error" && error && (
          <p className="mt-2 text-sm text-red-400 whitespace-pre-line">
            {error}
          </p>
        )}

        {(phase === "no-session" || phase === "not-tracker") && error && (
          <p className="mt-2 text-sm text-red-300 whitespace-pre-line">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
