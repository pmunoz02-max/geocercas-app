// src/pages/AuthCallback.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const LAST_ORG_KEY = "app_geocercas_last_org_id";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForSessionFromUrl(maxMs = 4000): Promise<boolean> {
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

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        // ✅ IMPORTANTE:
        // Para magic links (email) en SPA + PKCE, NO usamos verifyOtp().
        // Supabase hidrata la sesión automáticamente desde la URL
        // (requiere detectSessionInUrl: true en el cliente).

        const ok = await waitForSessionFromUrl(4500);
        if (!ok) {
          const msg = "session_not_created_from_magic_link";
          setError(msg);
          navigate(`/login?err=${encodeURIComponent(msg)}`, { replace: true });
          return;
        }

        // 1) Resolver org_id (RPC universal ya corregida)
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

        // 2) Redirect final (único flujo válido)
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
