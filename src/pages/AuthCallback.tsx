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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Une query (?a=1&b=2) + hash (#a=1&b=2) en un solo map.
 * Supabase muchas veces devuelve access_token/refresh_token en el hash.
 */
function getAllParams(search: string, hash: string) {
  const out = new URLSearchParams();

  // query
  const q = new URLSearchParams(search || "");
  q.forEach((v, k) => out.set(k, v));

  // hash (sin el #)
  const rawHash = (hash || "").startsWith("#") ? (hash || "").slice(1) : (hash || "");
  // Algunos providers usan "#/auth/callback?x=1" etc. Tomamos lo que parezca query
  const hashPart = rawHash.includes("?") ? rawHash.split("?").pop() || "" : rawHash;
  const h = new URLSearchParams(hashPart);
  h.forEach((v, k) => {
    // si ya existe en query, preferimos query
    if (!out.has(k)) out.set(k, v);
  });

  return out;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, session, role, isRootOwner, reloadAuth } = useAuth();

  const allParams = useMemo(
    () => getAllParams(location.search, window.location.hash),
    [location.search, location.hash]
  );

  // Supabase puede mandar "code" (PKCE) en query
  const code = allParams.get("code");

  // OTP / invite / magic link: token_hash + type (normalmente en query)
  const tokenHash = allParams.get("token_hash") || allParams.get("token");
  const type = allParams.get("type");

  // Implicit-style: access_token + refresh_token (a veces en hash)
  const accessToken = allParams.get("access_token");
  const refreshToken = allParams.get("refresh_token");

  // Siguiente destino interno opcional
  const nextParam = allParams.get("next");

  // Errores que Supabase pone en query/hash
  const errorParam = allParams.get("error") || allParams.get("error_code");
  const errorDesc = allParams.get("error_description") || allParams.get("error_message");

  const trackerOrgId = useMemo(() => {
    const v = allParams.get("tracker_org_id");
    return isUuid(v) ? v : null;
  }, [allParams]);

  const forcedOnce = useRef(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);

  // ✅ Forzar www siempre que caiga en root domain
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
        if (window.location.host.toLowerCase() === "tugeocercas.com") return;

        if (errorParam || errorDesc) {
          throw new Error(errorDesc || errorParam || "Authentication error");
        }

        // Caso: usuario entra al callback sin params (o link recortado)
        // -> si ya existe sesión, seguimos normal; si no, login sin error.
        const hasAnyAuthParams = Boolean(code || (accessToken && refreshToken) || (tokenHash && type));
        if (!hasAnyAuthParams) {
          const { data } = await supabase.auth.getSession();
          if (!data?.session) {
            // No params y no sesión: no es "error", solo no hay nada que finalizar.
            if (!cancelled) {
              setAuthError(null);
              setProcessing(false);
            }
            return;
          }
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
        }

        // Espera corta a que sesión aparezca
        for (let i = 0; i < 10; i++) {
          const { data } = await supabase.auth.getSession();
          if (data?.session) break;
          await sleep(200);
        }

        if (typeof reloadAuth === "function") {
          await reloadAuth();
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
  }, [
    code,
    tokenHash,
    type,
    accessToken,
    refreshToken,
    errorParam,
    errorDesc,
    reloadAuth,
  ]);

  useEffect(() => {
    if (processing || loading) return;

    // Si hay error real -> login con flag
    if (authError) {
      window.location.replace("https://www.tugeocercas.com/login?error=auth");
      return;
    }

    // Si no hay sesión, es login normal (sin error)
    if (!session) {
      window.location.replace("https://www.tugeocercas.com/login");
      return;
    }

    // Tracker org override
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
    trackerOrgId,
    reloadAuth,
    authError,
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


