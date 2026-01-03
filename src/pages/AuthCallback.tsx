import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isSafeInternalPath(p?: string | null) {
  if (!p) return false;
  if (typeof p !== "string") return false;
  if (!p.startsWith("/")) return false;
  if (p.startsWith("//")) return false;
  if (p.includes("://")) return false;
  if (/[\u0000-\u001F\u007F]/.test(p)) return false;
  return true;
}

function isUuid(v?: string | null) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

/**
 * Une params de query + hash (Supabase puede usar ambos)
 * - search: "?a=1&b=2"
 * - hash: "#access_token=...&refresh_token=..."  o "#/auth/callback?token_hash=...&type=invite"
 */
function getAllParams(search: string, hash: string) {
  const out = new URLSearchParams(search || "");

  const rawHash = (hash || "").startsWith("#") ? (hash || "").slice(1) : (hash || "");
  if (rawHash) {
    const hashPart = rawHash.includes("?") ? rawHash.split("?").pop() || "" : rawHash;
    const h = new URLSearchParams(hashPart);
    h.forEach((v, k) => {
      if (!out.has(k)) out.set(k, v);
    });
  }

  return out;
}

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading, role, isRootOwner, reloadAuth } = useAuth();

  const params = useMemo(
    () => getAllParams(location.search, location.hash),
    [location.search, location.hash]
  );

  const code = params.get("code");
  const tokenHash = params.get("token_hash") || params.get("token");
  const type = params.get("type"); // invite | recovery | email | magiclink
  const nextParam = params.get("next");

  const errorParam = params.get("error") || params.get("error_code");
  const errorDesc = params.get("error_description") || params.get("error_message");

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  const trackerOrgId = useMemo(() => {
    const v = params.get("tracker_org_id");
    return isUuid(v) ? v : null;
  }, [params]);

  const forcedOnce = useRef(false);
  const [processing, setProcessing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Forzar www si cae en root domain
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

  // Paso 1: Finalizar autenticación
  useEffect(() => {
    let cancelled = false;

    async function finalizeAuth() {
      try {
        if (window.location.host.toLowerCase() === "tugeocercas.com") return;

        if (errorParam || errorDesc) {
          throw new Error(errorDesc || errorParam || "Authentication error");
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as any,
          });
          if (error) throw error;
        } else {
          // ✅ Si no vienen params, NO lo tratamos como error:
          // solo seguimos si ya existe sesión.
          const { data } = await supabase.auth.getSession();
          if (!data?.session) {
            // no hubo nada que finalizar
            return;
          }
        }

        // Espera a que sesión aparezca
        for (let i = 0; i < 10; i++) {
          const { data } = await supabase.auth.getSession();
          if (data?.session) break;
          await sleep(200);
        }

        if (typeof reloadAuth === "function") {
          await reloadAuth();
        }
      } catch (e: any) {
        console.error("Auth callback error:", e);
        if (!cancelled) setAuthError(e?.message || "auth");
      } finally {
        if (!cancelled) setProcessing(false);
      }
    }

    finalizeAuth();
    return () => {
      cancelled = true;
    };
  }, [code, tokenHash, type, accessToken, refreshToken, errorParam, errorDesc, reloadAuth]);

  // Paso 2: navegación final
  useEffect(() => {
    if (processing || loading) return;

    if (authError) {
      navigate("/login?error=auth", { replace: true });
      return;
    }

    if (!session) {
      // si todavía no hay sesión, vamos al login (sin “error”)
      navigate("/login", { replace: true });
      return;
    }

    if (trackerOrgId && !forcedOnce.current) {
      forcedOnce.current = true;
      localStorage.setItem("force_tracker_org_id", trackerOrgId);
      localStorage.setItem("current_org_id", trackerOrgId);
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
    authError,
    nextParam,
    trackerOrgId,
    navigate,
  ]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        Finalizando autenticación…
      </div>
    </div>
  );
}
