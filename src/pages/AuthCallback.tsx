import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState("Procesando autenticación...");

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const next = url.searchParams.get("next") || "/inicio";

        // 🔥 Paso 1: Siempre intentar recuperar sesión automáticamente
        const { data: sessionData } = await supabase.auth.getSession();

        if (sessionData?.session?.access_token) {
          await bootstrap(sessionData.session.access_token);
          navigate(next, { replace: true });
          return;
        }

        // 🔥 Paso 2: Si viene code → intercambiar manualmente
        if (code) {
          const { data, error } =
            await supabase.auth.exchangeCodeForSession(code);

          if (error) throw error;

          const accessToken = data?.session?.access_token;
          if (!accessToken) throw new Error("no_access_token_after_exchange");

          await bootstrap(accessToken);
          navigate(next, { replace: true });
          return;
        }

        // 🔥 Paso 3: Fallback — intentar detectar sesión después de redirect
        setTimeout(async () => {
          const { data: retry } = await supabase.auth.getSession();
          if (retry?.session?.access_token) {
            await bootstrap(retry.session.access_token);
            navigate(next, { replace: true });
          } else {
            navigate(`/login?err=auth_failed`, { replace: true });
          }
        }, 800);

      } catch (err: any) {
        console.error(err);
        navigate(`/login?err=${err.message}`, { replace: true });
      }
    };

    run();
  }, []);

  async function bootstrap(accessToken: string) {
    const res = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error("bootstrap_failed");
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="p-6 border rounded-xl bg-white shadow">
        {status}
      </div>
    </div>
  );
}
