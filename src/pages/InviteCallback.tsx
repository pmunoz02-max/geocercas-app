// src/pages/InviteCallback.tsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";

/**
 * InviteCallback (flujo formal de INVITACIÓN)
 * - Se entra solo desde links con: ?token_hash=...&type=invite
 * - Verifica OTP estrictamente como 'invite' (sin mezclar con magic link)
 * - Nunca se queda colgado: timeout + UI clara
 * - Tras autenticar, redirige por rol en DB (AuthContext):
 *    tracker -> /tracker-gps
 *    otros   -> /inicio
 *
 * Nota:
 * - La creación de memberships/organización depende de tu backend (triggers/RPC).
 * - Este callback solo completa la autenticación del usuario invitado.
 */
export default function InviteCallback() {
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
        timeoutId = window.setTimeout(() => {
          setError(t("authInvite.timeout"));
          setProcessing(false);
        }, 15000);

        const token_hash = params.get("token_hash");
        const type = params.get("type");

        // ✅ Separación formal: aquí SOLO se aceptan links invite
        if (!token_hash || String(type || "").toLowerCase() !== "invite") {
          setError(t("authInvite.notInviteLink"));
          return;
        }

        const { error } = await supabase.auth.verifyOtp({
          token_hash,
          type: "invite" as any,
        });

        if (error) throw error;
      } catch (e: any) {
        console.error("InviteCallback error:", e);
        setError(t("authInvite.expiredOrUsed"));
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

  // Redirección por rol en DB (cuando ya haya sesión)
  useEffect(() => {
    if (loading || processing) return;
    if (!session) return;

    const roleLower = String(role || "").toLowerCase();
    if (roleLower === "tracker") {
      navigate("/tracker-gps", { replace: true });
    } else {
      navigate("/inicio", { replace: true });
    }
  }, [loading, processing, session, role, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h1 className="text-lg font-semibold">{t("authInvite.title")}</h1>
          <p className="text-sm opacity-80 whitespace-pre-line">{error}</p>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => navigate("/login?mode=magic", { replace: true })}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500"
            >
              {t("authInvite.goToLogin")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
      <div className="text-sm opacity-80">
        {processing ? t("authInvite.processing") : t("auth.processing")}
      </div>
    </div>
  );
}
