import React, { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { supabaseTracker } from "@/supabaseTrackerClient";

/**
 * AuthCallback UNIVERSAL y PERMANENTE
 * - Soporta PKCE (?code=...) e Implicit (#access_token=...&refresh_token=...)
 * - NO consulta roles/orgs (evita cuelgues por RLS/red)
 * - Decide destino por HOSTNAME:
 *     www.*      -> /inicio
 *     tracker.*  -> /tracker-gps
 * - Limpia el hash por seguridad.
 */

function isTrackerHostname(hostname) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function parseHashTokens(hash) {
  if (!hash || typeof hash !== "string") return null;
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(clean);

  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");

  if (!access_token) return null;
  return { access_token, refresh_token: refresh_token || "" };
}

function withTimeout(promise, ms, label = "timeout") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`Timeout en ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

export default function AuthCallback() {
  const [status, setStatus] = useState("Estableciendo sesión...");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const cleanUrl = () => {
      try {
        const clean = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, clean);
      } catch (_) {}
    };

    const run = async () => {
      try {
        setError(null);
        setStatus("Estableciendo sesión...");

        const trackerDomain = isTrackerHostname(window.location.hostname);
        const client = trackerDomain ? supabaseTracker : supabase;

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // 1) Consumir callback (PKCE o Implicit)
        if (code) {
          if (!client?.auth?.exchangeCodeForSession) {
            throw new Error("El SDK Supabase no soporta exchangeCodeForSession().");
          }

          setStatus("Confirmando Magic Link...");
          await withTimeout(
            client.auth.exchangeCodeForSession(code),
            8000,
            "exchangeCodeForSession"
          );
        } else {
          const tokens = parseHashTokens(window.location.hash);
          if (!tokens?.access_token) {
            throw new Error("No se encontraron tokens en el Magic Link.");
          }

          // Preferido (v2)
          if (client?.auth?.setSession) {
            setStatus("Guardando sesión...");
            await withTimeout(
              client.auth.setSession({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
              }),
              8000,
              "setSession"
            );
          } else if (client?.auth?.setAuth) {
            // Fallback (v1)
            setStatus("Guardando sesión...");
            client.auth.setAuth(tokens.access_token);
          } else {
            throw new Error("El SDK Supabase no soporta setSession/setAuth.");
          }
        }

        // 2) Verificar que la sesión exista
        setStatus("Verificando sesión...");
        const sessRes = await withTimeout(client.auth.getSession(), 8000, "getSession");
        const session = sessRes?.data?.session ?? null;

        if (!session?.user?.id) {
          throw new Error("No se pudo establecer la sesión. Reintenta el Magic Link.");
        }

        if (cancelled) return;

        // 3) Destino por dominio (universal, sin roles)
        const target = trackerDomain ? "/tracker-gps" : "/inicio";

        setStatus("Redirigiendo...");

        // 4) Limpieza para no dejar tokens en URL
        cleanUrl();

        window.location.replace(target);
      } catch (e) {
        console.error("[AuthCallback] error:", e);
        if (cancelled) return;

        setError(e?.message || "Error estableciendo sesión.");
        setStatus("No se pudo completar el inicio de sesión.");
        cleanUrl();
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="border rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">App Geocercas</h1>
        <p className="text-sm text-slate-600 mt-2">{status}</p>

        {error ? (
          <div className="mt-4 text-sm text-red-600">
            {error}
            <div className="mt-3 flex gap-2">
              <button
                className="border rounded px-3 py-2 text-xs"
                onClick={() => window.location.replace("/login")}
              >
                Ir a Login
              </button>
              <button
                className="border rounded px-3 py-2 text-xs"
                onClick={() => window.location.reload()}
              >
                Reintentar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
