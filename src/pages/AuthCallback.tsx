// src/pages/AuthCallback.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

function qp(name: string) {
  return new URLSearchParams(window.location.search).get(name);
}

function parseHash() {
  const hash = window.location.hash?.replace(/^#/, "") || "";
  const p = new URLSearchParams(hash);
  return {
    access_token: p.get("access_token"),
    refresh_token: p.get("refresh_token"),
  };
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Validando acceso…");

  useEffect(() => {
    (async () => {
      try {
        // 0) Error explícito
        const err = qp("error") || qp("err");
        if (err) {
          navigate(`/login?err=${encodeURIComponent(err)}`, { replace: true });
          return;
        }

        // 1) PKCE (?code=...)
        const code = qp("code");
        if (code) {
          setStatus("Confirmando código…");
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error || !data?.session) {
            navigate(`/login?err=${encodeURIComponent(error?.message || "exchange_failed")}`, {
              replace: true,
            });
            return;
          }
        } else {
          // 2) Magic link / invite (?token_hash=...&type=...)
          const token_hash = qp("token_hash");
          const type = qp("type") as "invite" | "magiclink" | "recovery" | "signup" | null;

          if (token_hash && type) {
            setStatus("Verificando enlace…");
            const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
            if (error || !data?.session) {
              navigate(`/login?err=${encodeURIComponent(error?.message || "verify_failed")}`, {
                replace: true,
              });
              return;
            }
          } else {
            // 3) Hash tokens
            const { access_token, refresh_token } = parseHash();
            if (access_token && refresh_token) {
              setStatus("Estableciendo sesión…");
              const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
              if (error || !data?.session) {
                navigate(`/login?err=${encodeURIComponent(error?.message || "set_session_failed")}`, {
                  replace: true,
                });
                return;
              }
            } else {
              navigate(`/login?err=${encodeURIComponent("missing_code_or_token_hash")}`, {
                replace: true,
              });
              return;
            }
          }
        }

        // 4) Persistir cookies HttpOnly en backend
        setStatus("Iniciando sesión…");
        await fetch("/api/auth/session", { method: "POST", credentials: "include" });

        // 5) Leer rol real desde backend (OJO: el campo es "role")
        setStatus("Cargando perfil…");
        const r = await fetch("/api/auth/session", { credentials: "include" });
        const j = await r.json().catch(() => ({}));

        const role = String(j?.role || "").toLowerCase();

        // 6) Hard redirect (evita que el router/shell lo pise)
        if (j?.authenticated && role === "tracker") {
          window.location.replace("/tracker-gps");
          return;
        }

        window.location.replace("/inicio");
      } catch (e: any) {
        navigate(`/login?err=${encodeURIComponent(e?.message || "callback_error")}`, {
          replace: true,
        });
      }
    })();
  }, [navigate]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{status}</h2>
        <p className="mt-2 text-sm text-slate-600">Un momento por favor…</p>
      </div>
    </div>
  );
}
