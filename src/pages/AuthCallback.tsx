// src/pages/AuthCallback.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext.jsx";

type Status =
  | { phase: "working"; message: string }
  | { phase: "error"; message: string };

function safeMsg(err: unknown): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  const anyErr = err as any;
  if (anyErr?.message) return String(anyErr.message);
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function parseHashParams(hash: string): Record<string, string> {
  const clean = (hash || "").replace(/^#/, "");
  const out: Record<string, string> = {};
  if (!clean) return out;
  for (const part of clean.split("&")) {
    const [k, v] = part.split("=");
    if (!k) continue;
    out[decodeURIComponent(k)] = decodeURIComponent(v || "");
  }
  return out;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const { reloadAuth } = useAuth();

  const [status, setStatus] = useState<Status>({
    phase: "working",
    message: "Procesando autenticación...",
  });

  const ran = useRef(false);

  async function decideNextPath(userId: string): Promise<string> {
    // Decide basado en roles (si falla, vuelve al panel)
    try {
      const { data } = await supabase
        .from("app_user_roles")
        .select("role")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      const role = String((data as any)?.role || "").toLowerCase();
      if (role === "tracker") return "/tracker-gps";
      return "/inicio";
    } catch {
      return "/inicio";
    }
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        setStatus({ phase: "working", message: "Validando enlace..." });

        const url = new URL(window.location.href);
        const qp = url.searchParams;
        const hash = parseHashParams(url.hash);

        const code = qp.get("code");
        const token_hash = qp.get("token_hash");
        const type = qp.get("type"); // invite | magiclink | recovery | signup | email_change

        // 1) PKCE (?code=...)
        if (code) {
          setStatus({ phase: "working", message: "Confirmando sesión (PKCE)..." });
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // 2) Magic link / invite con token_hash (?token_hash=...&type=...)
        else if (token_hash && type) {
          setStatus({ phase: "working", message: "Verificando enlace (OTP)..." });

          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as any,
          });

          if (error) throw error;
        }

        // 3) Legacy hash (#access_token=...&refresh_token=...)
        else if (hash.access_token && hash.refresh_token) {
          setStatus({ phase: "working", message: "Estableciendo sesión..." });

          const { error } = await supabase.auth.setSession({
            access_token: hash.access_token,
            refresh_token: hash.refresh_token,
          });

          if (error) throw error;
        } else {
          // Nada que procesar
          setStatus({
            phase: "error",
            message:
              "No se encontró información de autenticación en la URL (code / token_hash / access_token).",
          });
          return;
        }

        // Limpia la URL para evitar re-procesos / leaks
        window.history.replaceState({}, document.title, "/auth/callback");

        // 4) Confirmar sesión
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const session = data?.session ?? null;
        if (!session?.user?.id) {
          setStatus({
            phase: "error",
            message: "No se pudo establecer la sesión. Intenta abrir el enlace nuevamente.",
          });
          return;
        }

        setStatus({ phase: "working", message: "Cargando perfil..." });

        // 5) Refrescar contexto (org/roles/etc)
        try {
          await reloadAuth?.();
        } catch {
          // best-effort
        }

        const next = await decideNextPath(session.user.id);

        setStatus({ phase: "working", message: "Redirigiendo..." });

        navigate(next, { replace: true });
      } catch (err) {
        setStatus({ phase: "error", message: safeMsg(err) });
      }
    })();
  }, [navigate, reloadAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Auth Callback</h1>

        {status.phase === "working" ? (
          <div className="mt-4">
            <p className="text-slate-700">{status.message}</p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded bg-slate-100">
              <div className="h-full w-1/2 animate-pulse bg-slate-300" />
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-red-600 font-medium">Error</p>
            <p className="mt-2 text-slate-700 whitespace-pre-wrap">{status.message}</p>

            <div className="mt-6 flex gap-3">
              <button
                className="rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
                onClick={() => navigate("/login", { replace: true })}
              >
                Ir a Login
              </button>
              <button
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-800 hover:bg-slate-50"
                onClick={() => navigate("/", { replace: true })}
              >
                Ir al inicio
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
