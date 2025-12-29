// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { supabaseTracker } from "../supabaseTrackerClient";
import { useAuth } from "../context/AuthContext.jsx";

function isTrackerHostname(hostname: string) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

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
  const { reloadAuth } = useAuth();

  const trackerDomain = isTrackerHostname(window.location.hostname);
  const client = trackerDomain ? supabaseTracker : supabase;

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const code = useMemo(() => params.get("code"), [params]);

  const trackerOrgId = useMemo(() => {
    const v = params.get("tracker_org_id");
    return v && isUuid(v) ? v : null;
  }, [params]);

  const ranOnce = useRef(false);
  const [working, setWorking] = useState(true);

  useEffect(() => {
    let alive = true;
    if (ranOnce.current) return;
    ranOnce.current = true;

    (async () => {
      try {
        setWorking(true);

        if (trackerOrgId) {
          localStorage.setItem("force_tracker_org_id", trackerOrgId);
          localStorage.setItem("current_org_id", trackerOrgId);
        }

        // 1) PKCE code
        if (code) {
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("[AuthCallback] exchange error:", error);
            navigate("/login", { replace: true });
            return;
          }
        } else {
          // 2) Hash tokens (legacy)
          const { access_token, refresh_token } = parseHash(location.hash || "");
          if (access_token && refresh_token) {
            const { error } = await client.auth.setSession({ access_token, refresh_token });
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

        // 2) Tracker domain: NO recargar panel DB; directo
        if (trackerDomain) {
          navigate("/tracker-gps", { replace: true });
          return;
        }

        // 3) Panel domain: recalcular permisos
        if (typeof reloadAuth === "function") {
          await reloadAuth();
        }

        // 4) Si metadata dice tracker, manda a tracker
        const { data } = await supabase.auth.getUser();
        const appFlow = String(data?.user?.user_metadata?.app_flow ?? "").toLowerCase();
        if (appFlow === "tracker" || trackerOrgId) {
          navigate("/tracker-gps", { replace: true });
          return;
        }

        navigate("/inicio", { replace: true });
      } finally {
        if (alive) setWorking(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [client, code, trackerDomain, trackerOrgId, location.hash, navigate, reloadAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        Finalizando autenticación…
        {working ? "" : ""}
      </div>
    </div>
  );
}
