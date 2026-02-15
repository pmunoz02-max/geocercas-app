// src/pages/AuthCallbackTracker.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabaseTracker } from "../lib/supabaseTrackerClient";

function safeNextPath(next) {
  if (!next) return "/tracker-gps";
  if (next.startsWith("/")) return next;
  return "/tracker-gps";
}

export default function AuthCallbackTracker() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState("Procesando autenticación de Tracker...");

  const next = useMemo(() => {
    const n = new URLSearchParams(location.search).get("next") || "/tracker-gps";
    return safeNextPath(n);
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // Soporta links con ?code=... o hash tokens, según el flujo.
        // exchangeCodeForSession maneja el intercambio si viene "code".
        const url = window.location.href;
        const hasCode = new URL(url).searchParams.get("code");

        if (hasCode) {
          setStatus("Intercambiando code por sesión (Tracker)...");
          const { error } = await supabaseTracker.auth.exchangeCodeForSession(url);
          if (error) throw error;
        } else {
          // Si viene por hash (access_token/refresh_token)
          const hash = window.location.hash || "";
          const hp = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
          const access_token = hp.get("access_token") || "";
          const refresh_token = hp.get("refresh_token") || "";

          if (access_token && refresh_token) {
            setStatus("Creando sesión en Supabase (Tracker)...");
            const { error } = await supabaseTracker.auth.setSession({
              access_token,
              refresh_token,
            });
            if (error) throw error;
          }
        }

        // Limpia URL
        if (!cancelled) {
          const clean = new URL(window.location.href);
          clean.hash = "";
          window.history.replaceState({}, "", clean.toString());
        }

        setStatus("Listo. Entrando al Tracker...");
        if (!cancelled) navigate(next, { replace: true });
      } catch (e) {
        const msg = e?.message || "tracker_auth_failed";
        setStatus(`Error: ${msg}`);
        // No mandamos a /login del app para no mezclar sesiones.
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, next]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Tracker Auth</h1>
        <p className="mt-3 text-sm text-gray-700">{status}</p>
      </div>
    </div>
  );
}
