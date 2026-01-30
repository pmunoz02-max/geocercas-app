import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

function safeSet(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch {}
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      // ✅ marca de vida
      safeSet("auth_callback_ran_at", new Date().toISOString());
      safeSet("auth_callback_href", window.location.href);

      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get("token_hash");
      const type = (params.get("type") as "magiclink" | "recovery" | null) ?? null;

      // tu destino fijo para tracker
      const next = "/tracker-gps?tg_flow=tracker";

      try {
        if (!token_hash || !type) {
          const msg = "missing_code_or_token_hash";
          safeSet("auth_callback_err", msg);
          setError(msg);
          return;
        }

        // 1) verifyOtp
        const { data, error: vErr } = await supabase.auth.verifyOtp({ type, token_hash });

        if (vErr) {
          safeSet("auth_callback_err", vErr.message);
          setError(vErr.message);
          return;
        }

        // 2) hardening: forzar persistencia si viene session
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

        // 3) confirmar user
        const { data: u, error: uErr } = await supabase.auth.getUser();
        if (uErr) {
          safeSet("auth_callback_err", uErr.message);
          setError(uErr.message);
          return;
        }
        if (!u?.user) {
          const msg = "getUser null after verifyOtp";
          safeSet("auth_callback_err", msg);
          setError(msg);
          return;
        }

        safeSet("auth_callback_ok", "1");
        navigate(next, { replace: true });
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
          <p style={{ opacity: 0.8, maxWidth: 560 }}>
            Este enlace puede ser de un solo uso. Si algún escáner de seguridad lo abrió antes, se invalida.
            Reinvita al tracker y abre el enlace solo una vez, lo más rápido posible.
          </p>
        </>
      )}
    </div>
  );
}
