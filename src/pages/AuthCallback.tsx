// src/pages/AuthCallback.tsx

import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "../context/AuthContext"; // ✅ IMPORT CORRECTO (singular: context)

type Status = "idle" | "working" | "ok" | "error";

function getEnv(name: string) {
  const v = (import.meta as any)?.env?.[name];
  return typeof v === "string" ? v : "";
}

const SUPABASE_URL = getEnv("VITE_SUPABASE_URL");
const SUPABASE_ANON_KEY = getEnv("VITE_SUPABASE_ANON_KEY");

// Cliente Supabase autocontenido (evita depender de otros archivos)
const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

function safeSameOriginRedirect(to: string | null) {
  if (!to) return null;
  try {
    // Permite rutas absolutas tipo "/inicio" o URLs same-origin
    if (to.startsWith("/")) return to;
    const u = new URL(to);
    if (u.origin === window.location.origin) return u.pathname + u.search + u.hash;
    return null;
  } catch {
    return null;
  }
}

function niceType(raw: string | null) {
  const t = String(raw || "").toLowerCase();
  if (!t) return "";
  return t;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth() as any; // si tu AuthContext expone refresh(), lo usamos. Si no, no rompe.
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("Procesando autenticación…");
  const [detail, setDetail] = useState<string>("");

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const tokenHash = params.get("token_hash");
  const type = niceType(params.get("type")); // invite | magiclink | recovery | signup | email_change
  const redirectTo = safeSameOriginRedirect(params.get("redirect_to"));

  // Hash tokens (OAuth / implicit) — Supabase puede manejarlo con detectSessionInUrl,
  // pero hacemos fallback por seguridad.
  const hasHashTokens = useMemo(() => {
    const h = location.hash || "";
    return h.includes("access_token=") || h.includes("refresh_token=");
  }, [location.hash]);

  useEffect(() => {
    let cancelled = false;

    async function finishRedirect() {
      // Decide destino final:
      // - recovery => pantalla de reset
      // - tracker => /tracker-gps
      // - resto => /inicio (panel)
      const { data } = await supabase!.auth.getUser();
      const user = data?.user;

      const metaRole = String((user as any)?.user_metadata?.role || "").toLowerCase();
      const appRole = String((user as any)?.app_metadata?.role || "").toLowerCase();

      const role = metaRole || appRole;

      // Si viene redirect_to explícito y es seguro, úsalo (para flows internos)
      if (redirectTo) return navigate(redirectTo, { replace: true });

      if (type === "recovery") return navigate("/reset-password", { replace: true });

      // Tracker-only
      if (role === "tracker") return navigate("/tracker-gps", { replace: true });

      // Por defecto, panel
      return navigate("/inicio", { replace: true });
    }

    async function run() {
      try {
        if (!supabase) {
          setStatus("error");
          setMessage("Faltan variables de entorno de Supabase.");
          setDetail("Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel.");
          return;
        }

        setStatus("working");
        setMessage("Validando enlace…");
        setDetail("");

        // 1) Si hay token_hash + type => verifyOtp (invite/magiclink/recovery)
        if (tokenHash && type) {
          const allowed = new Set(["invite", "magiclink", "recovery", "signup", "email_change"]);
          if (!allowed.has(type)) {
            setStatus("error");
            setMessage("Tipo de enlace no soportado.");
            setDetail(`type=${type}`);
            return;
          }

          const { error } = await supabase.auth.verifyOtp({
            type: type as any,
            token_hash: tokenHash,
          });

          if (cancelled) return;

          if (error) {
            // 403 suele ser token ya usado/expirado o redirect URL no permitido
            setStatus("error");
            setMessage("El link del correo es inválido o ya expiró.");
            setDetail(
              `${error.message || "Error al verificar."}${
                error.status ? ` (HTTP ${error.status})` : ""
              }`
            );
            return;
          }

          // refresca contexto si existe
          if (typeof refresh === "function") {
            try {
              await refresh();
            } catch {
              // no bloquea
            }
          }

          setStatus("ok");
          setMessage("Acceso confirmado. Redirigiendo…");
          await finishRedirect();
          return;
        }

        // 2) Si hay tokens en el hash => supabase debería capturarlo solo con detectSessionInUrl
        if (hasHashTokens) {
          setMessage("Confirmando sesión…");
          // Pequeño delay para que detectSessionInUrl haga su trabajo
          await new Promise((r) => setTimeout(r, 250));

          const { data, error } = await supabase.auth.getSession();
          if (cancelled) return;

          if (error || !data?.session) {
            setStatus("error");
            setMessage("No se pudo completar la autenticación.");
            setDetail(error?.message || "Sesión no encontrada en el callback.");
            return;
          }

          if (typeof refresh === "function") {
            try {
              await refresh();
            } catch {
              // no bloquea
            }
          }

          setStatus("ok");
          setMessage("Sesión lista. Redirigiendo…");
          await finishRedirect();
          return;
        }

        // 3) Si no hay nada, intenta leer sesión
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (data?.session) {
          setStatus("ok");
          setMessage("Sesión detectada. Redirigiendo…");
          await finishRedirect();
          return;
        }

        setStatus("error");
        setMessage("No se encontró información de autenticación en el callback.");
        setDetail("Falta token_hash/type o tokens en el hash.");
      } catch (e: any) {
        if (cancelled) return;
        setStatus("error");
        setMessage("Ocurrió un error inesperado en el callback.");
        setDetail(String(e?.message || e));
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [tokenHash, type, redirectTo, hasHashTokens, navigate, refresh, location.hash]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-[min(920px,92vw)] bg-white rounded-3xl shadow-2xl p-10">
        <h1 className="text-2xl font-semibold mb-4">Auth Callback</h1>

        <div className="text-sm">
          <div className={status === "error" ? "text-red-600 font-semibold" : "text-slate-700"}>
            {status === "error" ? "Error" : status === "ok" ? "OK" : "Procesando"}
          </div>
          <div className="mt-2 text-slate-800">{message}</div>

          {detail ? (
            <div className="mt-3 text-slate-500 break-words">{detail}</div>
          ) : (
            <div className="mt-3 text-slate-400"> </div>
          )}
        </div>

        {status === "error" && (
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => navigate("/login", { replace: true })}
              className="px-5 py-3 rounded-xl bg-slate-900 text-white font-semibold"
            >
              Ir a Login
            </button>
            <button
              onClick={() => navigate("/", { replace: true })}
              className="px-5 py-3 rounded-xl bg-emerald-500 text-white font-semibold"
            >
              Ir al inicio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
