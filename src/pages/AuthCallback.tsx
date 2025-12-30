import React, { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { supabaseTracker } from "@/supabaseTrackerClient";

function isTrackerHostname(hostname) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function parseHashTokens(hash) {
  // hash viene como: "#access_token=...&refresh_token=...&type=magiclink..."
  if (!hash || typeof hash !== "string") return null;
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(clean);

  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");

  if (!access_token) return null;
  return { access_token, refresh_token: refresh_token || null };
}

function pickBestRole(rows) {
  const norm = (r) => String(r || "").toLowerCase().trim();
  const rank = (r) => {
    if (r === "owner") return 3;
    if (r === "admin") return 2;
    if (r === "viewer") return 1;
    if (r === "tracker") return 0;
    return -1;
  };

  let best = null;
  for (const row of rows || []) {
    const r = norm(row?.role);
    if (!r) continue;
    if (!best || rank(r) > rank(best)) best = r;
  }
  return best;
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

        let session = null;

        // 1) PKCE (code)
        if (code) {
          if (!client?.auth?.exchangeCodeForSession) {
            throw new Error("SDK Supabase no soporta exchangeCodeForSession().");
          }
          const { data, error: exErr } = await client.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
          session = data?.session ?? null;
        } else {
          // 2) IMPLICIT (hash tokens) - soporte universal
          const tokens = parseHashTokens(window.location.hash);

          if (tokens?.access_token) {
            // Preferido en supabase-js v2
            if (client?.auth?.setSession) {
              const { data, error: setErr } = await client.auth.setSession({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token || "",
              });
              if (setErr) throw setErr;
              session = data?.session ?? null;
            } else if (client?.auth?.setAuth) {
              // Fallback supabase-js v1
              client.auth.setAuth(tokens.access_token);
              // En v1, intentamos leer sesión luego
              const { data } = await client.auth.getSession?.();
              session = data?.session ?? null;
            } else {
              throw new Error("SDK Supabase no soporta setSession/setAuth para consumir hash tokens.");
            }
          } else {
            // 3) Sin code ni hash tokens: intentar recuperar sesión existente
            if (client?.auth?.getSession) {
              const { data } = await client.auth.getSession();
              session = data?.session ?? null;
            }
          }
        }

        // 4) Fallback: leer sesión ya guardada
        if (!session && client?.auth?.getSession) {
          const { data } = await client.auth.getSession();
          session = data?.session ?? null;
        }

        if (!session?.user?.id) {
          throw new Error("No se pudo establecer la sesión. Reintenta el Magic Link.");
        }

        if (cancelled) return;

        // 5) Verificar rol
        setStatus("Verificando rol...");

        const { data: rolesRows, error: rolesErr } = await supabase
          .from("app_user_roles")
          .select("role, org_id, created_at")
          .eq("user_id", session.user.id);

        if (rolesErr) console.warn("[AuthCallback] rolesErr:", rolesErr);

        const bestRole = pickBestRole(rolesRows || []);

        // 6) Resolver destino (trackers siempre a su pantalla)
        const PANEL_HOME = "/inicio";
        const TRACKER_HOME = "/tracker-gps";
        const TRACKER_BASE =
          (import.meta.env.VITE_TRACKER_URL || "https://tracker.tugeocercas.com").replace(/\/+$/, "");

        let target = PANEL_HOME;

        if (bestRole === "tracker") {
          target = trackerDomain ? TRACKER_HOME : `${TRACKER_BASE}${TRACKER_HOME}`;
        } else {
          target = PANEL_HOME;
        }

        setStatus("Redirigiendo...");

        // 7) Limpiar URL (evitar dejar tokens)
        cleanUrl();

        // 8) Redirigir
        window.location.replace(target);
      } catch (e) {
        console.error("[AuthCallback] error:", e);
        if (cancelled) return;

        setError(e?.message || "Error estableciendo sesión.");
        setStatus("No se pudo completar el inicio de sesión.");
        cleanUrl();
      }
    };

    const timeout = setTimeout(() => {
      if (cancelled) return;
      setError("Tiempo de espera agotado estableciendo sesión. Reintenta el Magic Link.");
      setStatus("No se pudo completar el inicio de sesión.");
      cleanUrl();
    }, 12000);

    run().finally(() => clearTimeout(timeout));

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
