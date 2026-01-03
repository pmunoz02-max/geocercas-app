import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isSafeInternalPath(p?: string | null) {
  return !!p && p.startsWith("/") && !p.startsWith("//") && !p.includes("://");
}

function getAllParams(search: string, hash: string) {
  const out = new URLSearchParams(search || "");

  const rawHash = (hash || "").startsWith("#")
    ? (hash || "").slice(1)
    : (hash || "");

  if (rawHash) {
    const hashPart = rawHash.includes("?")
      ? rawHash.split("?").pop() || ""
      : rawHash;
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
  const { session, loading, reloadAuth } = useAuth();

  const params = useMemo(
    () => getAllParams(location.search, window.location.hash),
    [location.search]
  );

  const code = params.get("code");
  const tokenHash = params.get("token_hash") || params.get("token");
  const type = params.get("type");
  const nextParam = params.get("next");
  const trackerOrgId = params.get("tracker_org_id");

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  const [processing, setProcessing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const once = useRef(false);

  // Paso 1: finalizar auth
  useEffect(() => {
    let cancelled = false;

    async function finalize() {
      try {
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
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            setProcessing(false);
            return;
          }
        }

        for (let i = 0; i < 10; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) break;
          await sleep(200);
        }

        await reloadAuth?.();
      } catch (e) {
        console.error("AuthCallback error:", e);
        if (!cancelled) setAuthError("auth");
      } finally {
        if (!cancelled) setProcessing(false);
      }
    }

    finalize();
    return () => {
      cancelled = true;
    };
  }, [code, tokenHash, type, accessToken, refreshToken, reloadAuth]);

  // Paso 2: navegación final
  useEffect(() => {
    if (processing || loading || once.current) return;
    once.current = true;

    if (authError) {
      navigate("/login?error=auth", { replace: true });
      return;
    }

    if (!session) {
      navigate("/login", { replace: true });
      return;
    }

    if (trackerOrgId) {
      localStorage.setItem("current_org_id", trackerOrgId);
    }

    if (nextParam && isSafeInternalPath(nextParam)) {
      navigate(nextParam, { replace: true });
    } else {
      navigate("/inicio", { replace: true });
    }
  }, [processing, loading, session, authError, nextParam, trackerOrgId, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-slate-500">
        Finalizando autenticación…
      </div>
    </div>
  );
}
