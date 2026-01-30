import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        // Marca de diagnóstico (para saber que el callback realmente corrió)
        try {
          localStorage.setItem("auth_callback_ran_at", new Date().toISOString());
        } catch {}

        const params = new URLSearchParams(window.location.search);
        const token_hash = params.get("token_hash");
        const type = (params.get("type") as "magiclink" | "recovery" | null) ?? null;

        // ✅ Como tu link NO trae next, lo fijamos aquí
        const next = "/tracker-gps?tg_flow=tracker";

        if (!token_hash || !type) {
          setError("missing_code_or_token_hash");
          return;
        }

        // 1) Verificar OTP (magiclink)
        const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
        if (error) {
          setError(error.message);
          return;
        }

        // 2) Forzar persistencia si viene session (hardening)
        if (data?.session?.access_token && data?.session?.refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
          if (setErr) {
            setError(setErr.message);
            return;
          }
        }

        // 3) Confirmar user real
        const { data: u, error: uErr } = await supabase.auth.getUser();
        if (uErr) {
          setError(uErr.message);
          return;
        }
        if (!u?.user) {
          setError("getUser null after verifyOtp");
          return;
        }

        // 4) Redirigir al tracker GPS
        navigate(next, { replace: true });
      } catch (e: any) {
        setError(e?.message || "AuthCallback exception");
      }
    };

    run();
  }, [navigate]);

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", fontFamily: "sans-serif" }}>
      {!error ? (
        <>
          <h3>Autenticando…</h3>
          <p>Preparando GPS</p>
        </>
      ) : (
        <>
          <h3>Error de autenticación</h3>
          <pre>{error}</pre>
        </>
      )}
    </div>
  );
}
