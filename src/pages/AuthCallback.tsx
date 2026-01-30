import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const LAST_ORG_KEY = "app_geocercas_last_org_id";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForSession(maxMs = 4500): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
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
    const run = async () => {
      try {
        const params = new URLSearchParams(window.location.search);

        // Si Supabase devolvió errores por URL, los mostramos
        const urlErr =
          params.get("error_description") ||
          params.get("error") ||
          params.get("message");
        if (urlErr) {
          const msg = String(urlErr);
          setError(msg);
          navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
          return;
        }

        const code = params.get("code");
        const token_hash = params.get("token_hash");
        const type = normalizeType(params.get("type"));

        // ✅ Caso A: PKCE "code" -> exchangeCodeForSession
        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) {
            const msg = exErr.message || "exchange_code_error";
            setError(msg);
            navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
            return;
          }
        }

        // ✅ Caso B: OTP "token_hash" -> verifyOtp
        if (!code && token_hash && type) {
          const { error: vErr } = await supabase.auth.verifyOtp({ type, token_hash });
          if (vErr) {
            const msg = vErr.message || "verifyOtp_error";
            setError(msg);
            navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
            return;
          }
        }

        // Si no vino ni code ni token_hash, algo está mal
        if (!code && !(token_hash && type)) {
          const msg = "missing_code_or_token_hash";
          setError(msg);
          navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
          return;
        }

        // ✅ Esperar a que exista sesión real (persistida/hidratada)
        const ok = await waitForSession(5000);
        if (!ok) {
          const msg = "session_not_created";
          setError(msg);
          navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
          return;
        }

        // ✅ Resolver org_id (RPC universal)
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

        // ✅ Redirect final
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
