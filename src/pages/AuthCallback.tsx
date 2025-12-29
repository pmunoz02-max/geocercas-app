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

// Keys explícitas (flow-isolated)
const AUTH_KEY_PANEL = "sb-tugeocercas-auth-token-panel";
const AUTH_KEY_TRACKER = "sb-tugeocercas-auth-token-tracker";

/**
 * Purga controlada SOLO de keys Supabase auth.
 * (No es “borra cookies”. Es reset determinístico de Supabase storage.)
 */
function purgeSupabaseAuthStorage() {
  const buckets: Storage[] = [];
  try {
    buckets.push(window.localStorage);
  } catch {}
  try {
    buckets.push(window.sessionStorage);
  } catch {}

  for (const storage of buckets) {
    try {
      storage.removeItem(AUTH_KEY_PANEL);
      storage.removeItem(AUTH_KEY_TRACKER);

      // Además, por compatibilidad con keys antiguas:
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k) keys.push(k);
      }

      for (const k of keys) {
        // Remueve restos viejos de supabase-js
        if (k.startsWith("sb-") && (k.includes("auth") || k.includes("token"))) {
          storage.removeItem(k);
        }
      }
    } catch {}
  }
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { reloadAuth } = useAuth();

  const params = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );

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

        // Si viene tracker_org_id, fijamos “one-shot” contexto tracker
        if (trackerOrgId) {
          localStorage.setItem("force_tracker_org_id", trackerOrgId);
          localStorage.setItem("current_org_id", trackerOrgId);
        }

        // 0) RESET determinístico antes de aceptar la nueva sesión
        purgeSupabaseAuthStorage();

        // 0.1) Intento de signOut local (best effort)
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {}

        // 1) PKCE: ?code=
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("[AuthCallback] exchangeCodeForSession error:", error);
            navigate("/login", { replace: true });
            return;
          }
        } else {
          // 2) Legacy hash tokens
          const { access_token, refresh_token } = parseHash(location.hash || "");
          if (access_token && refresh_token) {
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
            navigate("/login", { replace: true });
            return;
          }
        }

        // 2) Recalcular rol canónico desde BD
        if (typeof reloadAuth === "function") {
          await reloadAuth();
        }

        // 3) Tracker-only hard routing
        if (trackerOrgId) {
          navigate("/tracker-gps", { replace: true });
          return;
        }

        const { data } = await supabase.auth.getUser();
        const appFlow = String(
          data?.user?.user_metadata?.app_flow ?? ""
        ).toLowerCase();

        if (appFlow === "tracker") {
          navigate("/tracker-gps", { replace: true });
          return;
        }

        // 4) Default panel
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        Finalizando autenticación…
        {working ? "" : ""}
      </div>
    </div>
  );
}
