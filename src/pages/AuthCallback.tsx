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

/**
 * AuthCallback (Supabase Auth v2)
 * Objetivo: convertir callback (invite/magiclink/pkce) en sesión válida y redirigir.
 * - NO decide permisos/roles.
 * - NO aplica lógica de org.
 * - SOLO:
 *    1) exchangeCodeForSession (PKCE) si hay ?code=
 *    2) verifyOtp si hay token_hash + type (invite/magiclink/...)
 *    3) setSession si vienen access_token/refresh_token en hash
 *    4) espera session y navega.
 */
export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { reloadAuth } = useAuth() as any;

  const [status, setStatus] = useState<string>("Procesando autenticación…");
  const [detail, setDetail] = useState<string>("");

  const ranRef = useRef(false);

  // Une query + hash params (Supabase puede enviar en uno u otro)
  const params = useMemo(() => {
    const out = new URLSearchParams();

    // query
    const searchParams = new URLSearchParams(location.search || "");
    searchParams.forEach((v, k) => out.set(k, v));

    // hash: puede ser "#access_token=.." o "#/auth/callback?token_hash=.."
    const rawHash = (location.hash || "").replace(/^#/, "");
    if (rawHash) {
      let hashPart = rawHash;

      // si viene como ruta con '?', nos quedamos con lo que está después de '?'
      const qIndex = rawHash.indexOf("?");
      if (qIndex >= 0) hashPart = rawHash.slice(qIndex + 1);

      const hashParams = new URLSearchParams(hashPart);
      hashParams.forEach((v, k) => {
        // no pisar query si ya existe, salvo que query no lo tenga
        if (!out.has(k)) out.set(k, v);
      });
    }

    return out;
  }, [location.search, location.hash]);

  const nextPath = useMemo(() => {
    // Prioridad:
    // 1) ?next=/ruta
    // 2) ?returnTo=/ruta
    // 3) localStorage (opcional)
    // 4) default
    const fromQuery = params.get("next") || params.get("returnTo");
    if (isSafeInternalPath(fromQuery)) return fromQuery!;

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

        const code = params.get("code");
        const token_hash = params.get("token_hash");
        const type = params.get("type"); // "invite" | "magiclink" | "recovery" | etc.
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");

        // 1) PKCE: ?code=
        if (code) {
          setStatus("Validando código (PKCE)…");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        // 2) OTP: token_hash + type (invite/magic link)
        else if (token_hash && type) {
          setStatus("Verificando enlace (OTP)…");
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as any,
          });
          if (error) throw error;
        }
        // 3) Hash tokens: access_token + refresh_token
        else if (access_token && refresh_token) {
          setStatus("Estableciendo sesión…");
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) throw error;
        } else {
          // Si no hay nada de lo anterior, probablemente el link llegó incompleto
          throw new Error("Callback sin parámetros de autenticación (code / token_hash / access_token).");
        }

        // 4) Esperar a que supabase persista la sesión
        setStatus("Confirmando sesión…");
        let sessionOk = false;

        for (let i = 0; i < 15; i++) {
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            // error transitorio: espera y reintenta
            await sleep(150);
            continue;
          }
          if (data?.session) {
            sessionOk = true;
            break;
          }
          await sleep(150);
        }

        if (!sessionOk) {
          throw new Error("No se pudo confirmar sesión luego del callback.");
        }

        // 5) Opcional: forzar re-hidratación del AuthContext
        if (typeof reloadAuth === "function") {
          try {
            await reloadAuth();
          } catch {
            // No bloquea navegación si falla
          }
        }

        // Limpia redirect guardado si existe
        try {
          window.localStorage.removeItem("postAuthRedirect");
        } catch {}

        setStatus("Listo. Redirigiendo…");
        navigate(nextPath, { replace: true });
      } catch (e: any) {
        const msg = e?.message ? String(e.message) : "Error de autenticación";
        setStatus("Error de autenticación");
        setDetail(msg);

        // fallback universal
        navigate(`/login?error=auth`, { replace: true });
      }
    })();
  }, [navigate, params, nextPath, reloadAuth]);

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 8 }}>Auth Callback</h2>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>{status}</div>
      {detail ? (
        <pre style={{ whiteSpace: "pre-wrap", background: "#111", color: "#ddd", padding: 12, borderRadius: 8
