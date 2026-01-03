import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function isSafeInternalPath(p?: string | null) {
  if (!p) return false;
  if (typeof p !== "string") return false;
  if (!p.startsWith("/")) return false;
  if (p.includes("://")) return false;
  if (p.startsWith("//")) return false;
  if (/[\u0000-\u001F\u007F]/.test(p)) return false;
  return true;
}

function isUuid(v?: string | null) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, session, role, isRootOwner, reloadAuth } = useAuth();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type"); // invite | recovery | email
  const nextParam = params.get("next");

  const trackerOrgId = useMemo(() => {
    const v = params.get("tracker_org_id");
    return isUuid(v) ? v : null;
  }, [params]);

  const forcedOnce = useRef(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);

  // ✅ Forzar dominio canónico (no depender de redirects externos)
  useEffect(() => {
    const host = window.location.host.toLowerCase();
    if (host === "tugeocercas.com") {
      const target =
        "https://www.tugeocercas.com" +
        window.location.pathname +
        window.location.search +
        window.location.hash;
      window.location.replace(target);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function finalizeAuth() {
      try {
        // si aún estamos en el root sin www, dejamos que el replace ocurra
        if (window.location.host.toLowerCase() === "tugeocercas.com") return;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as any,
          });
          if (error) throw error;
        }

        if (!code && !(tokenHash && type)) {
          throw new Error("Falta token_hash o type en el callback");
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error("Auth callback error:", e);
          setAuthError(e?.message || "Authentication error");
        }
      } finally {
        if (!cancelled) setProcessing(false);
      }
    }

    finalizeAuth();
    return () => {
      cancelled = true;
    };
  }, [code, tokenHash, type]);

  useEffect(() => {
    if (processing || loading) return;

    if (authError) {
      navigate("/login?error=auth", { replace: true });
      return;
    }

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
    processing,
    loading,
    session,
    role,
    isRootOwner,
    nextParam,
    navigate,
    trackerOrgId,
    reloadAuth,
    authError,
  ]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        Finalizando autenticación…
      </div>
    </div>
  );
}

