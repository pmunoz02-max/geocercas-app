import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        // ✅ marcador para saber si ESTE archivo se ejecutó en producción
        try {
          localStorage.setItem("auth_callback_ran_at", new Date().toISOString());
        } catch {}

        const params = new URLSearchParams(window.location.search);

        const token_hash = params.get("token_hash");
        const type = (params.get("type") as "magiclink" | "recovery" | null) ?? null;
        const code = params.get("code");
        const next = params.get("next") || "/tracker-gps";

        // 1) MAGIC LINK REAL: token_hash + type
        if (token_hash && type) {
          const { data, error } = await supabase.auth.verifyOtp({
            type,
            token_hash,
          });

          if (error) {
            setError(error.message);
            return;
          }

          // ✅ FIX DEFINITIVO: forzar persistencia si viene session
          // (en algunos entornos verifyOtp NO “hidrata” storage automáticamente)
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
        }

        // 2) PKCE: code
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setError(error.message);
            return;
          }
        }

        // 3) Confirmar que YA hay user
        const { data: u, error: uErr } = await supabase.auth.getUser();
        if (uErr) {
          setError(uErr.message);
          return;
        }
        if (!u?.user) {
          setError("No se pudo establecer sesión (getUser null).");
          return;
        }

        // 4) Redirigir
        navigate(next, { replace: true });
      } catch (e: any) {
        setError(e?.message || "Error desconocido en AuthCallback");
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
          <pre>{error}</pre>
        </>
      )}
    </div>
  );
}
