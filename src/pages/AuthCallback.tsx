import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { supabaseTracker } from "../supabaseTrackerClient";

function isTrackerHostname(hostname: string) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function normalizeRole(r: any) {
  const v = String(r || "").toLowerCase().trim();
  if (v === "owner") return "owner";
  if (v === "admin") return "admin";
  if (v === "viewer") return "viewer";
  if (v === "tracker") return "tracker";
  return "";
}

function roleRank(r: string) {
  if (r === "owner") return 3;
  if (r === "admin") return 2;
  if (r === "viewer") return 1;
  if (r === "tracker") return 0;
  return -1;
}

function parseHash(hash: string) {
  const h = (hash || "").replace(/^#/, "");
  const params = new URLSearchParams(h);
  const access_token = params.get("access_token") || "";
  const refresh_token = params.get("refresh_token") || "";
  return { access_token, refresh_token };
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const [msg, setMsg] = useState("Procesando acceso...");

  useEffect(() => {
    const run = async () => {
      try {
        const trackerDomain = isTrackerHostname(window.location.hostname);
        const client = trackerDomain ? supabaseTracker : supabase;

        // 1) Resolver sesión desde code (PKCE) o desde hash tokens
        const search = new URLSearchParams(location.search || "");
        const code = search.get("code");

        if (code) {
          setMsg("Validando enlace...");
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const { access_token, refresh_token } = parseHash(location.hash || "");
          if (access_token && refresh_token) {
            setMsg("Estableciendo sesión...");
            const { error } = await client.auth.setSession({
              access_token,
              refresh_token,
            });
            if (error) throw error;
          }
        }

        // 2) Confirmar sesión
        const { data } = await client.auth.getSession();
        const session = data?.session ?? null;

        if (!session?.user?.id) {
          // sin sesión => al landing
          navigate("/", { replace: true });
          return;
        }

        // 3) Tracker domain: SIEMPRE a tracker-gps
        if (trackerDomain) {
          navigate("/tracker-gps", { replace: true });
          return;
        }

        // 4) Panel domain: decidir según rol real en app_user_roles
        setMsg("Cargando permisos...");
        const userId = session.user.id;

        const { data: roles, error: rolesErr } = await supabase
          .from("app_user_roles")
          .select("role, created_at")
          .eq("user_id", userId);

        if (rolesErr) {
          // Si por RLS/carrera no se puede leer aún, igual entramos al panel
          navigate("/inicio", { replace: true });
          return;
        }

        const normalized = (roles || [])
          .map((r) => normalizeRole(r?.role))
          .filter(Boolean) as string[];

        let bestRole = "";
        for (const r of normalized) {
          if (!bestRole || roleRank(r) > roleRank(bestRole)) bestRole = r;
        }

        if (bestRole === "tracker") {
          navigate("/tracker-gps", { replace: true });
        } else {
          // owner/admin/viewer o desconocido => panel
          navigate("/inicio", { replace: true });
        }
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);
        setMsg("No se pudo completar el acceso. Reintenta el enlace.");
        // fallback suave
        setTimeout(() => navigate("/", { replace: true }), 1200);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-md w-full">
        <div className="text-lg font-semibold text-slate-900">App Geocercas</div>
        <div className="text-sm text-slate-600 mt-2">{msg}</div>
      </div>
    </div>
  );
}
