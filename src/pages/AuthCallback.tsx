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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();

  // 🔑 Importante: usamos el estado del AuthContext (rol/memberships) para decidir el redirect,
  // NO un user_metadata.app_flow que puede quedar "pegado" y mandar a Tracker por error.
  const { reloadAuth, role, memberships } = useAuth();

  const trackerDomain = isTrackerHostname(window.location.hostname);
  const client = trackerDomain ? supabaseTracker : supabase;

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const code = useMemo(() => params.get("code"), [params]);

  // Señales explícitas de “flujo tracker” por URL (no por metadata):
  // - ?app_flow=tracker
  // - ?flow=tracker
  // - ?tracker=1
  const explicitTrackerFlow = useMemo(() => {
    const a = String(params.get("app_flow") || "").toLowerCase();
    const f = String(params.get("flow") || "").toLowerCase();
    const t = String(params.get("tracker") || "").toLowerCase();
    return a === "tracker" || f === "tracker" || t === "1" || t === "true";
  }, [params]);

  // tracker_org_id es válido solo si realmente vamos a Tracker.
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

        // 2) Tracker domain: directo
        if (trackerDomain) {
          // Si viene tracker_org_id, lo guardamos para el flujo tracker.
          if (trackerOrgId) {
            localStorage.setItem("force_tracker_org_id", trackerOrgId);
            localStorage.setItem("current_org_id", trackerOrgId);
          }
          navigate("/tracker-gps", { replace: true });
          return;
        }

        // 3) Panel domain: recalcular permisos (puede haber triggers recién ejecutándose)
        // Intentamos un par de recargas para evitar “tracker por defecto” por carrera.
        if (typeof reloadAuth === "function") {
          await reloadAuth();
          await sleep(350);
          await reloadAuth();
        }

        // 4) Decisión de flujo: SOLO enviamos a Tracker si:
        //    a) hay señal explícita por URL, o
        //    b) tracker_org_id corresponde a un membership tracker, o
        //    c) el usuario NO tiene ningún admin/owner y su rol efectivo es tracker.
        //
        // Nota: después de reloadAuth, el estado del contexto puede tardar un render en reflejarse.
        // Para no depender de un valor stale, leemos memberships “fresh” desde la DB del panel.
        let m: any[] = Array.isArray(memberships) ? memberships : [];
        try {
          const { data: u } = await supabase.auth.getUser();
          const uid = u?.user?.id;
          if (uid) {
            const { data: freshRows } = await supabase
              .from("app_user_roles")
              .select("org_id, role, created_at")
              .eq("user_id", uid);
            if (Array.isArray(freshRows)) m = freshRows;
          }
        } catch {
          // si falla, usamos lo que haya en contexto
        }

        const hasAdminish = m.some((x: any) => {
          const r = String(x?.role || "").toLowerCase();
          return r === "admin" || r === "owner";
        });

        const trackerOrgIsTrackerMembership =
          Boolean(trackerOrgId) &&
          m.some(
            (x: any) =>
              String(x?.org_id || "") === trackerOrgId &&
              String(x?.role || "").toLowerCase() === "tracker"
          );

        const resolvedRole = String(role || "").toLowerCase();

        const shouldGoTracker =
          explicitTrackerFlow ||
          trackerOrgIsTrackerMembership ||
          (!hasAdminish && resolvedRole === "tracker");

        if (shouldGoTracker) {
          if (trackerOrgId) {
            localStorage.setItem("force_tracker_org_id", trackerOrgId);
            localStorage.setItem("current_org_id", trackerOrgId);
          }
          navigate("/tracker-gps", { replace: true });
          return;
        }

        // 5) Panel normal (Admin/Owner/Viewer)
        // Si por error quedó force_tracker_org_id guardado de antes, lo limpiamos.
        localStorage.removeItem("force_tracker_org_id");
        navigate("/inicio", { replace: true });
      } finally {
        if (alive) setWorking(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    client,
    code,
    trackerDomain,
    trackerOrgId,
    explicitTrackerFlow,
    location.hash,
    navigate,
    reloadAuth,
    role,
    memberships,
  ]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        Finalizando autenticación…
        {working ? "" : ""}
      </div>
    </div>
  );
}