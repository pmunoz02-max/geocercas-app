// src/pages/AuthCallback.tsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { session, role, loading } = useAuth();
  const { t } = useTranslation();

  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    let timeoutId: number | undefined;

    const run = async () => {
      try {
        // ⏱️ Timeout de seguridad (15s) para evitar “Autenticando…” infinito
        timeoutId = window.setTimeout(() => {
          setError(t("auth.timeout"));
          setProcessing(false);
        }, 15000);

        // 1) PKCE (code)
        const code = params.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // 2) Magic Link / Invite (OTP)
        const token_hash = params.get("token_hash");
        const type = params.get("type");
        if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as any,
          });
          if (error) throw error;
        }
      } catch (e: any) {
        console.error("AuthCallback error:", e);
        setError(t("auth.invalidOrExpiredLink"));
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
        setProcessing(false);
      }
    };

    run();

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [params, t]);

  useEffect(() => {
    if (loading || processing) return;
    if (!session) return;

    const next = params.get("next");
    const roleLower = String(role || "").toLowerCase();

    if (roleLower === "tracker") {
      navigate("/tracker-gps", { replace: true });
    } else if (next) {
      navigate(next, { replace: true });
    } else {
      navigate("/inicio", { replace: true });
    }
  }, [loading, processing, session, role, navigate, params]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h1 className="text-lg font-semibold">{t("auth.errorTitle")}</h1>
          <p className="text-sm opacity-80 whitespace-pre-line">{error}</p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => navigate("/login", { replace: true })}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500"
            >
              {t("auth.backToLogin")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
      <div className="text-sm opacity-80">{t("auth.processing")}</div>
    </div>
  );
}
