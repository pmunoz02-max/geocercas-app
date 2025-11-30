// src/pages/TrackerGpsPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function TrackerGpsPage() {
  const navigate = useNavigate();

  // "checking" | "requesting" | "tracking" | "error"
  const [phase, setPhase] = useState("checking");
  const [error, setError] = useState("");
  const [coords, setCoords] = useState(null);

  // 1) Validar sesión y rol directamente con Supabase (SIN AuthContext)
  useEffect(() => {
    let active = true;

    const checkSessionAndRole = async () => {
      try {
        setPhase("checking");

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("[TrackerGps] getSession error:", sessionError);
        }

        if (!session) {
          if (!active) return;
          // Sin sesión → vete directo a login
          navigate("/login", { replace: true });
          return;
        }

        const { data: rows, error: roleErr } = await supabase
          .from("user_roles_view")
          .select("role_name");

        if (roleErr) {
          console.warn("[TrackerGps] error user_roles_view:", roleErr);
        }

        const hasTrackerRole =
          Array.isArray(rows) &&
          rows.some(
            (r) =>
              String(r.role_name || "").trim().toLowerCase() === "tracker"
          );

        console.log("[TrackerGps] tiene rol tracker?:", hasTrackerRole);

        if (!active) return;

        // 👇 SI NO ES TRACKER: lo mandamos directo al panel
        if (!hasTrackerRole) {
          navigate("/inicio", { replace: true });
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

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [phase]);

  if (phase === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="w-full max-w-sm rounded-2xl bg-slate-800/80 border border-slate-700 p-6 text-center shadow-lg">
          <p className="text-sm text-slate-200">
            Verificando tu sesión de tracker…
          </p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="w-full max-w-sm rounded-2xl bg-slate-800/80 border border-slate-700 p-6 text-center shadow-lg">
          <h1 className="text-xl font-semibold mb-2">Error en tracker</h1>
          <p className="text-sm text-red-300 whitespace-pre-line">{error}</p>
        </div>
      </div>
    );
  }

  // phase === "requesting" | "tracking"
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white px-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800/80 border border-slate-700 p-6 text-center shadow-lg">
        <h1 className="text-xl font-semibold mb-2">Tracker activo</h1>
        <p className="text-sm text-slate-300 mb-4">
          Mantén esta pantalla abierta. Tu ubicación se enviará
          automáticamente mientras te muevas. El sistema solo usa los puntos que
          estén dentro de las geocercas asignadas a tu usuario.
        </p>

        {phase === "requesting" && (
          <p className="text-sm text-slate-200 mb-2">
            Esperando permiso de ubicación…
          </p>
        )}

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
      </div>
    </div>
  );
}
