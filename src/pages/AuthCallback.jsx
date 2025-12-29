// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function isSafeInternalPath(p: string | null) {
  if (!p) return false;
  if (typeof p !== "string") return false;
  if (!p.startsWith("/")) return false;
  if (p.includes("://")) return false;
  if (p.startsWith("//")) return false;
  if (/[\u0000-\u001F\u007F]/.test(p)) return false;
  return true;
}

function isUuid(v: any) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

/**
 * AuthCallback robusto:
 * - Fuerza el exchange del `code` -> session (no depende de auto-detección)
 * - Si venías logueado como owner/admin, reemplaza la sesión correctamente
 * - Si llega tracker_org_id => fuerza tracker flow (one-shot)
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, session, role, isRootOwner, reloadAuth } = useAuth();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const code = useMemo(() => params.get("code"), [params]);
  const nextParam = useMemo(() => params.get("next") || null, [params]);

  // viene desde invite-user: /auth/callback?tracker_org_id=<uuid>
  const trackerOrgId = useMemo(() => {
    const v = params.get("tracker_org_id");
    return isUuid(v) ? v : null;
  }, [params]);

  const exchangedOnce = useRef(false);
  const forcedOnce = useRef(false);

  const [exchanging, setExchanging] = useState(true);

  // 1) Siempre intentar exchange explícito si hay `code`
  useEffect(() => {
    let alive = true;

    async function runExchange() {
      try {
        // Si no hay code, no hacemos nada aquí
        if (!code) return;

        if (exchangedOnce.current) return;
        exchangedOnce.current = true;

        setExchanging(true);

        // Fuerza exchange del code por sesión
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[AuthCallback] exchangeCodeForSession error:", error);
          // Si falla, mandamos a login
          if (alive) navigate("/login", { replace: true });
          return;
        }

        // Recalcular AuthContext con la nueva sesión
        if (typeof reloadAuth === "function") await reloadAuth();
      } finally {
        if (alive) setExchanging(false);
      }
    }

    runExchange();

    return () => {
      alive = false;
    };
  }, [code, navigate, reloadAuth]);

  // 2) Luego de tener sesión y rol, forzar tracker org (si aplica) y navegar
  useEffect(() => {
    if (loading) return;
    if (exchanging) return;

    if (!session) {
      navigate("/login", { replace: true });
      return;
    }

    // SOLO invite tracker: forzar org activa ONE-SHOT
    if (trackerOrgId && !forcedOnce.current) {
      forcedOnce.current = true;

      localStorage.setItem("force_tracker_org_id", trackerOrgId);
      localStorage.setItem("current_org_id", trackerOrgId);

      if (typeof reloadAuth === "function") reloadAuth();
      return;
    }

    const roleLower = String(role || "").toLowerCase();

    // tracker => tracker-only
    if (roleLower === "tracker") {
      navigate("/tracker-gps", { replace: true });
      return;
    }

    // no trackers: respetar next si es seguro
    let dest = "/inicio";
    if (nextParam && isSafeInternalPath(nextParam)) {
      if (nextParam.startsWith("/tracker-gps")) dest = "/inicio";
      else if (nextParam.startsWith("/admins") && !isRootOwner) dest = "/inicio";
      else dest = nextParam;
    }

    navigate(dest, { replace: true });
  }, [
    loading,
    exchanging,
    session,
    role,
    isRootOwner,
    nextParam,
    navigate,
    trackerOrgId,
    reloadAuth,
  ]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        Finalizando autenticación…
      </div>
    </div>
  );
}
