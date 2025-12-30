import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { supabaseTracker } from "@/supabaseTrackerClient";

/**
 * AuthCallback.jsx
 * - Procesa Magic Links (PKCE ?code=... o hash #access_token=...).
 * - Establece sesión en el cliente correcto según dominio:
 *    - tracker.*  => supabaseTracker
 *    - panel      => supabase
 * - Redirige de forma UNIVERSAL:
 *    - role tracker  => /tracker-gps
 *    - role no-tracker => /inicio
 * - Si no puede leer roles por carrera/RLS: fallback seguro
 *    - tracker domain => /tracker-gps
 *    - panel domain   => /inicio
 */

function isTrackerHostname(hostname) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function parseHashTokens(hash) {
  const h = String(hash || "").replace(/^#/, "");
  const params = new URLSearchParams(h);
  return {
    access_token: params.get("access_token") || "",
    refresh_token: params.get("refresh_token") || "",
    // A veces viene type=recovery/magiclink, etc.
    type: params.get("type") || "",
  };
}

function normalizeRole(role) {
  const r = String(role || "").toLowerCase().trim();
  if (r === "owner") return "owner";
  if (r === "admin") return "admin";
  if (r === "viewer") return "viewer";
  if (r === "tracker") return "tracker";
  return "";
}

function roleRank(role) {
  if (role === "owner") return 3;
  if (role === "admin") return 2;
  if (role === "viewer") return 1;
  if (role === "tracker") return 0;
  return -1;
}

async function resolveBestRoleForUser(userId) {
  // Nota: usamos el supabase del panel para consultar roles
  // porque app_user_roles está en el proyecto principal.
  const { data, error } = await supabase
    .from("app_user_roles")
    .select("role, created_at")
    .eq("user_id", userId);

  if (error) return { role: "", error };

  const roles = (data || [])
    .map((r) => normalizeRole(r?.role))
    .filter(Boolean);

  let best = "";
  for (const r of roles) {
    if (!best || roleRank(r) > roleRank(best)) best = r;
  }
  return { role: best, error: null };
}

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState("Procesando acceso...");
  const [details, setDetails] = useState("");

  const trackerDomain = useMemo(
    () => isTrackerHostname(window.location.hostname),
    []
  );

  const client = useMemo(
    () => (trackerDomain ? supabaseTracker : supabase),
    [trackerDomain]
  );

  useEffect(() => {
    const run = async () => {
      try {
        // 1) Resolver sesión desde ?code=... (PKCE) o desde hash tokens
        const search = new URLSearchParams(location.search || "");
        const code = search.get("code");

        if (code) {
          setStatus("Validando enlace...");
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const { access_token, refresh_token } = parseHashTokens(location.hash);
          if (access_token && refresh_token) {
            setStatus("Estableciendo sesión...");
            const { error } = await client.auth.setSession({
              access_token,
              refresh_token,
            });
            if (error) throw error;
          }
        }

        // 2) Confirmar sesión
        setStatus("Confirmando sesión...");
        const { data: sessData, error: sessErr } = await client.auth.getSession();
        if (sessErr) throw sessErr;

        const session = sessData?.session ?? null;
        const userId = session?.user?.id ?? null;

        if (!userId) {
          // Sin sesión => volver al landing correspondiente
          if (trackerDomain) navigate("/tracker-gps", { replace: true });
          else navigate("/", { replace: true });
          return;
        }

        // 3) Si estamos en tracker domain: SIEMPRE tracker-gps
        //    (El dominio tracker es un "lock" de UX + seguridad)
        if (trackerDomain) {
          navigate("/tracker-gps", { replace: true });
          return;
        }

        // 4) Panel domain: resolver rol real en app_user_roles
        setStatus("Cargando permisos...");

        const { role, error } = await resolveBestRoleForUser(userId);

        if (error) {
          console.warn("[AuthCallback] No se pudo leer app_user_roles, fallback a /inicio:", error);
          navigate("/inicio", { replace: true });
          return;
        }

        if (role === "tracker") {
          navigate("/tracker-gps", { replace: true });
          return;
        }

        // owner/admin/viewer o desconocido => panel
        navigate("/inicio", { replace: true });
      } catch (e) {
        console.error("[AuthCallback] Error:", e);
        const msg = e?.message || "Error desconocido";
        setStatus("No se pudo completar el acceso.");
        setDetails(msg);

        // Fallback seguro según dominio
        setTimeout(() => {
          if (trackerDomain) navigate("/tracker-gps", { replace: true });
          else navigate("/", { replace: true });
        }, 1200);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-md w-full">
        <div className="text-lg font-semibold text-slate-900">App Geocercas</div>
        <div className="text-sm text-slate-600 mt-2">{status}</div>
        {details ? (
          <div className="text-xs text-slate-500 mt-3 break-all">{details}</div>
        ) : null}
      </div>
    </div>
  );
}
