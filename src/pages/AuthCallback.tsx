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
        const err = qp("error") || qp("err");
        if (err) {
          navigate(`/login?err=${encodeURIComponent(err)}`, { replace: true });
          return;
        }

        // invite_id (nuestro ticket permanente)
        const invite_id = qp("invite_id") || "";

        // 1) PKCE (?code=...)
        const code = qp("code");
        if (code) {
          setStatus("Confirmando código…");
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error || !data?.session) {
            navigate(`/login?err=${encodeURIComponent(error?.message || "exchange_failed")}`, { replace: true });
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
              navigate(`/login?err=${encodeURIComponent(error?.message || "verify_failed")}`, { replace: true });
              return;
            }
          } else {
            // 3) Hash tokens (#access_token=...&refresh_token=...)
            const { access_token, refresh_token } = parseHash();
            if (access_token && refresh_token) {
              setStatus("Estableciendo sesión…");
              const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
              if (error || !data?.session) {
                navigate(`/login?err=${encodeURIComponent(error?.message || "set_session_failed")}`, { replace: true });
                return;
              }
            } else {
              navigate(`/login?err=${encodeURIComponent("missing_code_or_token_hash")}`, { replace: true });
              return;
            }
          }
        }

        // 4) Obtener tokens reales desde Supabase (fuente de verdad)
        setStatus("Preparando sesión…");
        const { data: sessData } = await supabase.auth.getSession();
        const s = sessData?.session;

        if (!s?.access_token) {
          navigate(`/login?err=${encodeURIComponent("missing_access_token")}`, { replace: true });
          return;
        }

        // 5) Setear cookies HttpOnly (tg_at/tg_rt) + aceptar invite si viene invite_id
        setStatus("Iniciando sesión…");

        if (invite_id) {
          await fetch("/api/auth/session", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "accept_tracker_invite",
              invite_id,
              access_token: s.access_token,
              refresh_token: s.refresh_token,
            }),
          });
        } else {
          await fetch("/api/auth/session", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: s.access_token,
              refresh_token: s.refresh_token,
            }),
          });
        }

        // 6) Leer rol/org real desde backend y redirigir
        setStatus("Cargando perfil…");
        const r = await fetch("/api/auth/session", { credentials: "include" });
        const j = await r.json().catch(() => ({}));

        const role = String(j?.role || "").toLowerCase();

        if (j?.authenticated && role === "tracker") {
          window.location.replace("/tracker-gps");
          return;
        }

        window.location.replace("/inicio");
      } catch (e: any) {
        navigate(`/login?err=${encodeURIComponent(e?.message || "callback_error")}`, { replace: true });
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
