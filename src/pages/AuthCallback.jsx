// src/pages/AuthCallback.tsx  (puede ser .tsx o .jsx, el contenido es JS válido)
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function isSafeInternalPath(p) {
  if (!p) return false;
  if (typeof p !== "string") return false;
  if (!p.startsWith("/")) return false;
  if (p.includes("://")) return false;
  if (p.startsWith("//")) return false;
  if (/[\u0000-\u001F\u007F]/.test(p)) return false;
  return true;
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

/**
 * AuthCallback robusto:
 * - Fuerza el exchange del `code` -> session (no depende de auto-detección)
 * - Reemplaza una sesión previa (owner/admin) por la del invitado
 * - Si llega tracker_org_id => fuerza tracker flow (one-shot)
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, session, role, isRootOwner, reloadAuth } = useAuth();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const code = useMemo(() => params.get("code"), [params]);
  const nextParam = useMemo(() => params.get("next") || null, [params]);

  const trackerOrgId = useMemo(() => {
    const v = params.get("tracker_org_id");
    return isUuid(v) ? v : null;
  }, [params]);

  const exchangedOnce = useRef(false);
  const forcedOnce = useRef(false);
  const [exchanging, setExchanging] = useState(true);

  // 1) Exchange explícito si hay `code`
  useEffect(() => {
    let alive = true;

    async function runExchange() {
      try {
        if (!code) return;
        if (exchangedOnce.current) return;
        exchangedOnce.current = true;

        setExchanging(true);

        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[AuthCallback] exchangeCodeForSession error:", error);
          if (alive) navigate("/login", { replace: true });
          return;
        }

        if (typeof reloadAuth === "function") {
          await reloadAuth();
        }
      } finally {
        if (alive) setExchanging(false);
      }
    }

    runExchange();
    return () => {
      alive = false;
    };
  }, [code, navigate, reloadAuth]);

  // 2) Luego navegar según rol (y force tracker org si aplica)
  useEffect(() => {
    if (loading) return;
    if (exchanging) return;

    if (!session) {
      navigate("/login", { replace: true });
      return;
    }

    if (trackerOrgId && !forcedOnce.current) {
      forcedOnce.current = true;
      localStorage.setItem("force_tracker_org_id", trackerOrgId);
      localStorage.setItem("current_org_id", trackerOrgId);
      if (typeof reloadAuth === "function") reloadAuth();
      return;
    }

    const roleLower = String(role || "").toLowerCase();

    if (roleLower === "tracker") {
      navigate("/tracker-gps", { replace: true });
      return;
    }

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
