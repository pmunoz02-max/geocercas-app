// src/pages/AuthCallback.tsx
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { session, role, loading } = useAuth();

  useEffect(() => {
    const run = async () => {
      // 1. Procesar PKCE (code)
      const code = params.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }

      // 2. Procesar Magic Link / OTP
      const token_hash = params.get("token_hash");
      const type = params.get("type");
      if (token_hash && type) {
        await supabase.auth.verifyOtp({
          token_hash,
          type: type as any,
        });
      }
    };

    run();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!session) return;

    const next = params.get("next");

    const roleLower = String(role || "").toLowerCase();

    // 3. Redirect FINAL y explícito
    if (roleLower === "tracker") {
      navigate("/tracker-gps", { replace: true });
    } else if (next) {
      navigate(next, { replace: true });
    } else {
      navigate("/inicio", { replace: true });
    }
  }, [loading, session, role]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
      <div className="text-sm opacity-80">Autenticando…</div>
    </div>
  );
}
