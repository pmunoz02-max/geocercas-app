// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function isUuid(v: any) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

function parseHash(hash: string) {
  const h = (hash || "").replace(/^#/, "");
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

  // viene desde invite-user: /auth/callback?tracker_org_id=<uuid>
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

        // Si llega tracker_org_id, lo guardamos one-shot para AuthContext
        if (trackerOrgId) {
          localStorage.setItem("force_tracker_org_id", trackerOrgId);
          localStorage.setItem("current_org_id", trackerOrgId);
        }

        // 1) Caso PKCE: viene ?code=...
        if (code) {
          // IMPORTANTÍSIMO: si había sesión previa en el navegador, la “contamina”.
          // La reemplazamos localmente antes de hacer exchange.
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
          // 2) Caso OAuth/magic-link legacy: viene en hash #access_token=...
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
          }
        }

        // Rehidrata AuthContext con la sesión real (la del link)
        if (typeof reloadAuth === "function") {
          await reloadAuth();
        }

        // Si por alguna razón aún no hay sesión, manda a login
        const { data } = await supabase.auth.getSession();
        if (!data?.session) {
          navigate("/login", { replace: true });
          return;
        }

        // Navegación final: el AuthGuard/SmartFallback también reforzará esto
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

  // Defensa: si ya está logueado y NO es tracker, fuera del callback
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
