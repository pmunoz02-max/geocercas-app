import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const LAST_ORG_KEY = "app_geocercas_last_org_id";

function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    // ignore
  }
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        // Marca de vida (útil si algo vuelve a fallar)
        safeSet("auth_callback_ran_at", new Date().toISOString());

        const params = new URLSearchParams(window.location.search);
        const token_hash = params.get("token_hash");
        const type = (params.get("type") as "magiclink" | "recovery" | null) ?? null;

        // Tu destino fijo para tracker
        const nextBase = "/tracker-gps?tg_flow=tracker";

        if (!token_hash || !type) {
          const msg = "missing_code_or_token_hash";
          setError(msg);
          navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
          return;
        }

        // 1) Verificar magic link
        const { data, error: vErr } = await supabase.auth.verifyOtp({
          type,
          token_hash,
        });

        if (vErr) {
          const msg = vErr.message || "verifyOtp_error";
          setError(msg);
          navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
          return;
        }

        // 2) Hardening: forzar persistencia si verifyOtp entrega session
        if (data?.session?.access_token && data?.session?.refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });

          if (setErr) {
            const msg = setErr.message || "setSession_error";
            setError(msg);
            navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
            return;
          }
        }

        // 3) Confirmar user
        const { data: u, error: uErr } = await supabase.auth.getUser();
        if (uErr || !u?.user) {
          const msg = uErr?.message || "getUser_null_after_verifyOtp";
          setError(msg);
          navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
          return;
        }

        // 4) Obtener contexto (org_id) — ahora debe funcionar también para trackers
        const { data: ctx, error: ctxErr } = await supabase.rpc("get_my_context");

        if (ctxErr) {
          const msg = ctxErr.message || "get_my_context_error";
          setError(msg);
          navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
          return;
        }

        const orgId = ctx?.org_id ? String(ctx.org_id) : null;

        if (!orgId) {
          const msg = "org_id_not_resolved";
          setError(msg);
          navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
          return;
        }

        // 5) Persistir org para AuthContext/TrackerGPS
        safeSet(LAST_ORG_KEY, orgId);
        safeSet("auth_callback_ok", "1");

        // 6) Redirigir al tracker con org_id
        const target = `${nextBase}&org_id=${encodeURIComponent(orgId)}`;
        navigate(target, { replace: true });
      } catch (e: any) {
        const msg = e?.message || "auth_callback_exception";
        setError(msg);
        navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
      }
    };

    run();
  }, [navigate]);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        fontFamily: "sans-serif",
        padding: 16,
      }}
    >
      {!error ? (
        <>
          <h3>Autenticando…</h3>
          <p>Preparando GPS</p>
        </>
      ) : (
        <>
          <h3>Error de autenticación</h3>
          <pre style={{ whiteSpace: "pre-wrap", maxWidth: 560 }}>{error}</pre>
        </>
      )}
    </div>
  );
}
