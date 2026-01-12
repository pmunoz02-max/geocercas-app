import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();

  const ranRef = useRef(false); // 🔐 lock universal
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 🔐 EVITA doble ejecución (StrictMode / remounts)
    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      try {
        const search = new URLSearchParams(location.search);

        const code = search.get("code");
        const token_hash = search.get("token_hash");
        const type = search.get("type");

        // OAuth flow
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          navigate("/inicio", { replace: true });
          return;
        }

        // Magic / Invite / Recovery flow
        if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as any,
          });

          if (error) throw error;

          navigate("/inicio", { replace: true });
          return;
        }

        throw new Error("Callback inválido: faltan parámetros");
      } catch (e: any) {
        console.error("[AuthCallback]", e);
        setError(e?.message || "Error autenticando");
      }
    };

    run();
  }, [location.search, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="p-6 rounded-xl border border-red-500/30 bg-red-500/10">
          <p className="font-semibold">Error de autenticación</p>
          <p className="mt-2 text-sm">{error}</p>
          <button
            className="mt-4 px-4 py-2 rounded-lg bg-white text-slate-900"
            onClick={() => navigate("/login", { replace: true })}
          >
            Ir a Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <p className="opacity-70">Autenticando…</p>
    </div>
  );
}
