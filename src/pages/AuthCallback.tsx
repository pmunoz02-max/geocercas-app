import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthProvider";

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

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { reloadAuth } = useAuth() as any;

  const [status, setStatus] = useState("Procesando autenticación…");
  const [detail, setDetail] = useState<string>("");

  const ranRef = useRef(false);

  const params = useMemo(() => {
    const out = new URLSearchParams();

    // Query string
    const searchParams = new URLSearchParams(location.search || "");
    searchParams.forEach((v, k) => out.set(k, v));

    // Hash (puede venir como "#access_token=..." o "#/auth/callback?token_hash=...")
    const rawHash = (location.hash || "").replace(/^#/, "");
    if (rawHash) {
      let hashPart = rawHash;
      const qIndex = rawHash.indexOf("?");
      if (qIndex >= 0) hashPart = rawHash.slice(qIndex + 1);

      const hashParams = new URLSearchParams(hashPart);
      hashParams.forEach((v, k) => {
        if (!out.has(k)) out.set(k, v);
      });
    }

    return out;
  }, [location.search, location.hash]);

  const nextPath = useMemo(() => {
    const fromQuery = params.get("next") || params.get("returnTo");
    if (isSafeInternalPath(fromQuery)) return fromQuery!;

    // fallback por si guardaste un redirect antes del login
    const ls = (() => {
      try {
        return window.localStorage.getItem("postAuthRedirect");
      } catch {
        return null;
      }
    })();

    if (isSafeInternalPath(ls)) return ls!;
    return "/inicio";
  }, [params]);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        setStatus("Procesando autenticación…");
        setDetail("");

        const errorParam = params.get("error") || params.get("error_code");
        const errorDesc =
          params.get("error_description") || params.get("error_message");
        if (errorParam || errorDesc) {
          throw new Error(String(errorDesc || errorParam));
        }

        const code = params.get("code");
        const token_hash = params.get("token_hash") || params.get("token");
        const type = params.get("type");
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");

        // 1) PKCE
        if (code) {
          setStatus("Validando código (PKCE)…");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        // 2) OTP (invite/magiclink/etc)
        else if (token_hash && type) {
          setStatus("Verificando enlace (OTP)…");
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as any,
          });
          if (error) throw error;
        }
        // 3) access/refresh en hash
        else if (access_token && refresh_token) {
          setStatus("Estableciendo sesión…");
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) throw error;
        } else {
          // Si no hay params, revisa si ya existe sesión
          const { data } = await supabase.auth.getSession();
          if (!data?.session) {
            throw new Error(
              "Callback sin parámetros de autenticación (code / token_hash / access_token)."
            );
          }
        }

        // Esperar persistencia de sesión
        setStatus("Confirmando sesión…");
        let ok = false;
        for (let i = 0; i < 15; i++) {
          const { data, error } = await supabase.auth.getSession();
          if (!error && data?.session) {
            ok = true;
            break;
          }
          await sleep(150);
        }
        if (!ok) throw new Error("No se pudo confirmar sesión luego del callback.");

        // Re-hidratar contexto si existe
        if (typeof reloadAuth === "function") {
          try {
            await reloadAuth();
          } catch {
            // no bloquea
          }
        }

        try {
          window.localStorage.removeItem("postAuthRedirect");
        } catch {}

        setStatus("Listo. Redirigiendo…");
        navigate(nextPath, { replace: true });
      } catch (e: any) {
        const msg = e?.message ? String(e.message) : "Error de autenticación";
        setStatus("Error de autenticación");
        setDetail(msg);
        navigate("/login?error=auth", { replace: true });
      }
    })();
  }, [navigate, params, nextPath, reloadAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        <div className="font-medium">{status}</div>
        {detail ? (
          <div className="mt-2 text-xs text-slate-500 break-words">{detail}</div>
        ) : null}
      </div>
    </div>
  );
}
