// src/pages/AuthCallback.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

function parseHash(hash) {
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

        if (trackerOrgId) {
          localStorage.setItem("force_tracker_org_id", trackerOrgId);
          localStorage.setItem("current_org_id", trackerOrgId);
        }

        // 1) PKCE / magic link moderno: ?code=...
        if (code) {
          // Reemplaza sesión local previa (owner/admin) antes del exchange
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch (_) {}

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
            } catch (_) {}

            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });

            if (error) {
              console.error("[AuthCallback] setSession error:", error);
              navigate("/login", { replace: true });
              return;
            }
          } else {
            // Sin code ni hash => callback inválido
            navigate("/login", { replace: true });
            return;
          }
        }

        if (typeof reloadAuth === "function") {
          await reloadAuth();
        }

        // Siempre aterriza en tracker-gps; tus guards harán cumplir el rol
        navigate("/tracker-gps", { replace: true });
      } finally {
        if (alive) setWorking(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [code, trackerOrgId, location.hash, navigate, reloadAuth]);

  // Defensa secundaria
  useEffect(() => {
    if (loading) return;
    if (!session) return;
    const r = String(role || "").toLowerCase();
    if (r && r !== "tracker") {
      navigate("/inicio", { replace: true });
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
