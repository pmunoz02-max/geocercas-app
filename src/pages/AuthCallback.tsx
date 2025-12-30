import React, { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { supabaseTracker } from "@/supabaseTrackerClient";

/**
 * AuthCallback universal:
 * - Soporta Magic Link con:
 *    A) PKCE:  /auth/callback?code=...
 *    B) Implicit: /auth/callback#access_token=...&refresh_token=...
 * - Crea sesión y redirige:
 *    - Admin/Owner/Viewer -> /inicio  (panel)
 *    - Tracker            -> /tracker-gps (tracker)
 *
 * Importante:
 * - NO usa "window.supabase" (no existe global).
 * - Limpia la URL (borra hash/tokens) al final por seguridad.
 */

function isTrackerHostname(hostname) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
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

    const run = async () => {
      try {
        setError(null);
        setStatus("Estableciendo sesión...");

        const trackerDomain = isTrackerHostname(window.location.hostname);
        const client = trackerDomain ? supabaseTracker : supabase;

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // 1) Consumir callback (PKCE o Implicit)
        let session = null;

        if (code) {
          // PKCE
          const { data, error: exErr } = await client.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
          session = data?.session ?? null;
        } else {
          // Implicit (hash: access_token, refresh_token...)
          // getSessionFromUrl guarda sesión si storeSession=true
          const { data, error: fromUrlErr } = await client.auth.getSessionFromUrl({
            storeSession: true,
          });
          if (fromUrlErr) throw fromUrlErr;
          session = data?.session ?? null;
        }

        // 2) Fallback: leer sesión ya guardada
        if (!session) {
          const { data } = await client.auth.getSession();
          session = data?.session ?? null;
        }

        if (!session?.user?.id) {
          throw new Error("No se pudo establecer la sesión. Reintenta el Magic Link.");
        }

        if (cancelled) return;

        // 3) Determinar destino por rol
        //    Roles siempre se consultan en el proyecto principal (panel),
        //    incluso si el callback se ejecuta desde tracker.
        setStatus("Verificando rol...");

        const { data: rolesRows, error: rolesErr } = await supabase
          .from("app_user_roles")
          .select("role, org_id, created_at")
          .eq("user_id", session.user.id);

        if (rolesErr) {
          // Si por RLS no permite leer roles, al menos no nos quedamos colgados
          console.warn("[AuthCallback] rolesErr:", rolesErr);
        }

        const bestRole = pickBestRole(rolesRows || []);

        // 4) Construir redirecciones
        const PANEL_HOME = "/inicio";
        const TRACKER_HOME = "/tracker-gps";

        // Si tu tracker vive en subdominio separado, usa esto:
        const TRACKER_BASE =
          (import.meta.env.VITE_TRACKER_URL || "https://tracker.tugeocercas.com").replace(/\/+$/, "");

        let target = PANEL_HOME;

        if (bestRole === "tracker") {
          // Regla: trackers solo a su pantalla
          if (trackerDomain) target = TRACKER_HOME;
          else target = `${TRACKER_BASE}${TRACKER_HOME}`;
        } else {
          // admin/owner/viewer -> panel
          target = PANEL_HOME;
        }

        setStatus("Redirigiendo...");

        // 5) Limpiar URL para no dejar tokens en el hash
        try {
          const cleanUrl = `${window.location.origin}${window.location.pathname}`;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch (_) {}

        // 6) Redirigir (replace evita volver al callback con back)
        window.location.replace(target);
      } catch (e) {
        console.error("[AuthCallback] error:", e);
        if (cancelled) return;

        setError(e?.message || "Error estableciendo sesión.");
        setStatus("No se pudo completar el inicio de sesión.");
        // Limpieza por seguridad
        try {
          const cleanUrl = `${window.location.origin}${window.location.pathname}`;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch (_) {}
      }
    };

    // Timeout anti-cuelgue (universal)
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setError("Tiempo de espera agotado estableciendo sesión. Reintenta el Magic Link.");
      setStatus("No se pudo completar el inicio de sesión.");
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
