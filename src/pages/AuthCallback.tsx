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

// Solo permitimos rutas internas tipo "/tracker-gps" (evita open-redirect)
function safeNextPath(raw: string | null, fallback: string) {
  const s = String(raw || "").trim();
  if (!s) return fallback;
  if (!s.startsWith("/")) return fallback;
  if (s.startsWith("//")) return fallback;
  return s;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Validando acceso…");
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const err = qp("error") || qp("err");
        if (err) throw new Error(err);

        // Si viene org_id en el redirect_to, lo guardamos para TrackerGpsPage
        const orgId = qp("org_id");
        if (orgId) {
          try {
            localStorage.setItem("tracker_org_id", orgId);
          } catch {
            // ignore
          }
        }

        const tgFlow = String(qp("tg_flow") || "").toLowerCase();
        const nextRaw = qp("next");
        const fallback = tgFlow === "tracker" ? "/tracker-gps" : "/inicio";
        const next = safeNextPath(nextRaw, fallback);

        // 1) PKCE (?code=...)
        const code = qp("code");
        if (code) {
          setStatus("Confirmando código…");
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error || !data?.session) throw new Error(error?.message || "exchange_failed");
        } else {
          // 2) OTP style (?token_hash=...&type=...)
          const token_hash = qp("token_hash");
          const type = qp("type") as "invite" | "magiclink" | "recovery" | "signup" | null;

          if (token_hash && type) {
            setStatus("Verificando enlace…");
            const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
            if (error || !data?.session) throw new Error(error?.message || "verify_failed");
          } else {
            // 3) Hash tokens (#access_token=...&refresh_token=...)
            const { access_token, refresh_token } = parseHash();
            if (access_token && refresh_token) {
              setStatus("Estableciendo sesión…");
              const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
              if (error || !data?.session) throw new Error(error?.message || "set_session_failed");
            } else {
              throw new Error("missing_code_or_token_hash");
            }
          }
        }

        // Confirmar sesión real (fuente de verdad)
        setStatus("Preparando sesión…");
        const { data: sessData, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw new Error(sessErr.message);
        if (!sessData?.session?.access_token) throw new Error("missing_access_token");

        if (!alive) return;

        // ✅ Redirección directa (sin /api/*, sin /login)
        window.location.replace(next);
      } catch (e: any) {
        if (!alive) return;
        setFatal(e?.message || "callback_error");
      }
    })();

    return () => {
      alive = false;
    };
  }, [navigate]);

  if (fatal) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-red-600">No se pudo validar el acceso</h2>
          <p className="mt-2 text-sm text-slate-700">{fatal}</p>
          <button
            className="mt-4 w-full rounded-lg bg-slate-900 py-3 text-white"
            onClick={() => window.location.replace("/")}
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{status}</h2>
        <p className="mt-2 text-sm text-slate-600">Un momento por favor…</p>
      </div>
    </div>
  );
}
