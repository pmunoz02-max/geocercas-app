// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function isUuid(v: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v ?? "")
  );
}

function parseHash(hash: string) {
  const h = String(hash || "").replace(/^#/, "");
  const p = new URLSearchParams(h);
  return {
    access_token: p.get("access_token"),
    refresh_token: p.get("refresh_token"),
    type: p.get("type"),
  };
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, session, role, reloadAuth } = useAuth();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const code = useMemo(() => params.get("code"), [params]);

  const trackerOrgId = useMemo(() => {
    const v = params.get("tracker_org_id");
    return isUuid(v) ? v : null;
  }, [params]);

  const ranOnce = useRef(false);
  const [working, setWorking] = useState(true);

  useEffect(() => {
    let alive = true;

    async function run() {
      if (ranOnce.current) return;
      ranOnce.current = true;

      try {
        setWorking(true);

        // Si viene tracker_org_id, fijamos contexto tracker desde ya
        if (trackerOrgId) {
          localStorage.setItem("force_tracker_org_id", trackerOrgId);
          localStorage.setItem("current_org_id", trackerOrgId);
        }

        // 1) PKCE / moderno: ?code=...
        if (code) {
          // IMPORTANTE: limpiamos sesión LOCAL para no “ganar” una sesión admin previa
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {}

          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("[AuthCallback] exchangeCodeForSession error:", error);
            navigate("/login", { replace: true });
            return;
          }
        } else {
          // 2) Legacy: #access_token=...&refresh_token=...
          const { access_token, refresh_token } = parseHash(location.hash || "");
          if (access_token && refresh_token) {
            try {
              await supabase.auth.signOut({ scope: "local" });
            } catch {}

            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) {
              console.error("[AuthCallback] setSession error:", error);
              navigate("/login", { replace: true });
              return;
            }
          } else {
            // callback inválido
            navigate("/login", { replace: true });
            return;
          }
        }

        // Refrescamos AuthContext para recalcular rol canónico desde BD
        if (typeof reloadAuth === "function") {
          await reloadAuth();
        }

        // Candado tracker-only: si viene trackerOrgId, NO hay discusión
        if (trackerOrgId) {
          navigate("/tracker-gps", { replace: true });
          return;
        }

        // Candado adicional por metadata (backend-driven)
        const { data } = await supabase.auth.getUser();
        const appFlow = String(data?.user?.user_metadata?.app_flow ?? "").toLowerCase();
        if (appFlow === "tracker") {
          navigate("/tracker-gps", { replace: true });
          return;
        }

        // Si no es tracker, manda al inicio y guards harán lo suyo
        navigate("/inicio", { replace: true });
      } finally {
        if (alive) setWorking(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [code, trackerOrgId, location.hash, navigate, reloadAuth]);

  // Defensa secundaria: si ya hay sesión y rol y es tracker => tracker-gps
  useEffect(() => {
    if (loading) return;
    if (!session) return;

    const r = String(role || "").toLowerCase();
    if (r === "tracker") {
      navigate("/tracker-gps", { replace: true });
    }
  }, [loading, session, role, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        Finalizando autenticación…
        {working ? "" : ""}
      </div>
    </div>
  );
}
