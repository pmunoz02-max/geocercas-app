import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

function parseQuery() {
  const url = new URL(window.location.href);
  const token_hash = url.searchParams.get("token_hash") || "";
  const type = url.searchParams.get("type") || "";
  const next = url.searchParams.get("next") || "";
  const error = url.searchParams.get("error") || "";
  const error_description = url.searchParams.get("error_description") || "";
  return { url, token_hash, type, next, error, error_description };
}

function parseHash() {
  const h = window.location.hash || "";
  const params = new URLSearchParams(h.startsWith("#") ? h.slice(1) : h);
  const access_token = params.get("access_token") || "";
  const refresh_token = params.get("refresh_token") || "";
  const type = params.get("type") || "";
  return { access_token, refresh_token, type };
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Procesando autenticación…");
  const [errorMsg, setErrorMsg] = useState("");

  const info = useMemo(() => {
    const q = parseQuery();
    const h = parseHash();
    return { ...q, ...h };
  }, []);

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        if (String(info.type || "").toLowerCase() === "invite") {
          setErrorMsg(
            "Este enlace pertenece al sistema antiguo (INVITE) y ya no es válido. Solicita un nuevo Magic Link."
          );
          setStatus("Error de autenticación");
          return;
        }

        const { data: existing } = await supabase.auth.getSession();
        if (existing?.session?.user) {
          const target = (info.type || "").toLowerCase() === "recovery" ? "/reset-password" : "/inicio";
          navigate(target, { replace: true });
          return;
        }

        if (info.access_token && info.refresh_token) {
          setStatus("Creando sesión…");
          const { error } = await supabase.auth.setSession({
            access_token: info.access_token,
            refresh_token: info.refresh_token,
          });
          if (error) throw error;

          window.history.replaceState({}, document.title, info.url.pathname + info.url.search);

          const target = (info.type || "").toLowerCase() === "recovery" ? "/reset-password" : "/inicio";
          navigate(target, { replace: true });
          return;
        }

        if (info.token_hash && info.type) {
          const lockKey = `authcb_v1:${info.type}:${info.token_hash}`;
          if (sessionStorage.getItem(lockKey)) {
            setErrorMsg("Este enlace ya fue procesado. Si necesitas entrar, solicita un nuevo Magic Link.");
            setStatus("Error de autenticación");
            return;
          }
          sessionStorage.setItem(lockKey, "1");

          setStatus("Verificando enlace…");
          const { error } = await supabase.auth.verifyOtp({
            type: info.type as any,
            token_hash: info.token_hash,
          });
          if (error) throw error;

          window.history.replaceState({}, document.title, "/auth/callback");

          const t = (info.type || "").toLowerCase();
          const target = t === "recovery" ? "/reset-password" : "/inicio";
          navigate(target, { replace: true });
          return;
        }

        setErrorMsg("Faltan parámetros de autenticación. Solicita un nuevo Magic Link e inténtalo nuevamente.");
        setStatus("Error de autenticación");
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);
        if (!alive) return;
        setStatus("Error de autenticación");
        setErrorMsg(
          e?.message || e?.error_description || "Email link inválido o expirado. Solicita un nuevo Magic Link."
        );
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 p-4">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow">
        <h1 className="text-lg font-semibold">{status}</h1>

        {errorMsg ? (
          <>
            <p className="text-sm opacity-85 whitespace-pre-line">{errorMsg}</p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => navigate("/login", { replace: true })}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium"
              >
                Ir a Login
              </button>
            </div>
            <div className="text-[11px] opacity-60">
              Tip: abre el Magic Link en Chrome/Safari. Si falló antes, intenta en incógnito y solicita un link nuevo.
            </div>
          </>
        ) : (
          <p className="text-sm opacity-70">Un momento…</p>
        )}
      </div>
    </div>
  );
}
