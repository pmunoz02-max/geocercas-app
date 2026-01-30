import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const LAST_ORG_KEY = "app_geocercas_last_org_id";

function safeSet(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch {}
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        safeSet("auth_callback_ran_at", new Date().toISOString());
        safeSet("auth_callback_href", window.location.href);

        const params = new URLSearchParams(window.location.search);
        const token_hash = params.get("token_hash");
        const type = (params.get("type") as "magiclink" | "recovery" | null) ?? null;

        if (!token_hash || !type) {
          const msg = "missing_code_or_token_hash";
          safeSet("auth_callback_err", msg);
          setError(msg);
          return;
        }

        // 1) Verificar magiclink
        const { data, error: vErr } = await supabase.auth.verifyOtp({ type, token_hash });
        if (vErr) {
          safeSet("auth_callback_err", vErr.message);
          setError(vErr.message);
          return;
        }

        // 2) Forzar persistencia si viene session (hardening)
        if (data?.session?.access_token && data?.session?.refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
          if (setErr) {
            safeSet("auth_callback_err", setErr.message);
            setError(setErr.message);
            return;
          }
        }

        // 3) Confirmar user
        const { data: u, error: uErr } = await supabase.auth.getUser();
        const user = u?.user;
        if (uErr || !user) {
          const msg = uErr?.message || "getUser null after verifyOtp";
          safeSet("auth_callback_err", msg);
          setError(msg);
          return;
        }

        // 4) Resolver org_id (NO depender de URL)
        let orgId: string | null = null;

        // 4a) Preferido: RPC canonical
        try {
          const { data: ctx, error: ctxErr } = await supabase.rpc("get_my_context");
          if (!ctxErr && ctx?.ok && ctx?.org_id) orgId = String(ctx.org_id);
        } catch {}

        // 4b) Fallback: memberships
        if (!orgId) {
          try {
            const { data: m, error: mErr } = await supabase
              .from("memberships")
              .select("org_id, created_at")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!mErr && m?.org_id) orgId = String(m.org_id);
          } catch {}
        }

        if (!orgId) {
          const msg = "org_id_not_resolved";
          safeSet("auth_callback_err", msg);
          setError("No se pudo resolver org_id para este tracker.");
          return;
        }

        // 5) Persistir org_id para TrackerGPS/AuthContext
        safeSet(LAST_ORG_KEY, orgId);
        safeSet("auth_callback_ok", "1");
        safeSet("auth_callback_org_id", orgId);

        // 6) Redirigir a tracker con org_id explícito
        navigate(`/tracker-gps?tg_flow=tracker&org_id=${encodeURIComponent(orgId)}`, { replace: true });
      } catch (e: any) {
        const msg = e?.message || "AuthCallback exception";
        safeSet("auth_callback_err", msg);
        setError(msg);
      }
    };

    run();
  }, [navigate]);

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", fontFamily: "sans-serif", padding: 16 }}>
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
