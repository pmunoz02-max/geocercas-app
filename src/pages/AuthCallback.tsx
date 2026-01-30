import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const LAST_ORG_KEY = "app_geocercas_last_org_id";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasSupabaseTokenInLS(): boolean {
  try {
    const keys = Object.keys(localStorage || {});
    return keys.some((k) => /^sb-.*-auth-token$/i.test(k) && !!localStorage.getItem(k));
  } catch {
    return false;
  }
}

async function waitForSession(maxMs = 2500): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < maxMs) {
    // 1) token persisted?
    if (hasSupabaseTokenInLS()) return true;

    // 2) session in memory?
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) return true;
    } catch {
      // ignore
    }

    await sleep(150);
  }

  return false;
}

function normalizeType(raw: string | null): "magiclink" | "recovery" | null {
  if (raw === "magiclink" || raw === "recovery") return raw;
  return null;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Debug runtime instance (comparable with TrackerGpsPage)
    console.log("SUPABASE CLIENT ID (AuthCallback)", supabase);

    const run = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const token_hash = params.get("token_hash");
        const type = normalizeType(params.get("type"));

        if (!token_hash || !type) {
          const msg = "missing_code_or_token_hash";
          setError(msg);
          navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
          return;
        }

        // 1) verifyOtp
        const { data, error: vErr } = await supabase.auth.verifyOtp({ type, token_hash });
        if (vErr) {
          const msg = vErr.message || "verifyOtp_error";
          setError(msg);
          navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
          return;
        }

        // 2) setSession hardening
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

        // 3) Esperar a que la sesión se persista (evita race condition)
        const ok = await waitForSession(3000);
        if (!ok) {
          const msg = "session_not_persisted";
          setError(msg);
          navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
          return;
        }

        // 4) Resolver org_id (RPC universal ya corregida)
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

        try {
          localStorage.setItem(LAST_ORG_KEY, orgId);
        } catch {
          // ignore
        }

        // 5) Redirect final
        navigate(`/tracker-gps?tg_flow=tracker&org_id=${encodeURIComponent(orgId)}`, {
          replace: true,
        });
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
