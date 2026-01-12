// src/pages/Login.tsx
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

type Mode = "password" | "magic";

/**
 * Login universal y permanente:
 * - Fuente de verdad: AuthContext (loading + user).
 * - Password login: navega a /inicio.
 * - Magic link: SIEMPRE redirige a /auth/callback.
 *   Luego AuthCallback + AuthContext resuelven rol en DB y redirigen (tracker/panel).
 */
const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Contrato universal: loading + user
  const { loading, user } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("password");

  const [loadingAction, setLoadingAction] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Si ya hay user, ir al panel
  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate("/inicio", { replace: true });
    }
  }, [loading, user, navigate]);

  // Reset mensajes al cambiar URL
  useEffect(() => {
    setErrorMsg(null);
    setInfoMsg(null);
  }, [location.key]);

  // Modo desde querystring (?mode=magic|password)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlMode = params.get("mode");
    if (urlMode === "magic") setMode("magic");
    if (urlMode === "password") setMode("password");
  }, [location.search]);

  // Captura errores en hash (p.ej. enlaces vencidos)
  useEffect(() => {
    const hash = location.hash || "";
    if (!hash.startsWith("#")) return;

    const raw = hash.slice(1);
    const params = new URLSearchParams(raw);
    const errorCode = params.get("error_code");
    const errorDesc = params.get("error_description");

    if (!errorCode && !errorDesc) return;

    let friendly = t("login.errorMagicLink", "No se pudo validar el enlace. Intenta nuevamente.");

    if ((errorCode || "").toLowerCase().includes("otp_expired")) {
      friendly = t("login.magicExpired", "El enlace ya expiró. Genera uno nuevo desde /login.");
    }

    if (errorDesc) friendly += `\n${decodeURIComponent(errorDesc)}`;

    setErrorMsg(friendly);
    setMode("magic");
  }, [location.hash, t]);

  // LOGIN CON CONTRASEÑA
  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email || !password) {
      setErrorMsg(t("login.errorMissingCredentials", "Debes ingresar correo y contraseña."));
      return;
    }

    try {
      setLoadingAction(true);

      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      navigate("/inicio", { replace: true });
    } catch {
      setErrorMsg(t("common.unexpectedError", "Error inesperado."));
    } finally {
      setLoadingAction(false);
    }
  };

  // LOGIN CON MAGIC LINK (OTP)
  const handleSubmitMagic = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email) {
      setErrorMsg(t("login.errorMissingEmail", "Debes ingresar tu correo."));
      return;
    }

    try {
      setLoadingAction(true);

      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setInfoMsg(
        t("login.infoMagicLinkSent", "Te enviamos un enlace a tu correo. Ábrelo para iniciar sesión.")
      );
    } catch {
      setErrorMsg(t("common.unexpectedError", "Error inesperado."));
    } finally {
      setLoadingAction(false);
    }
  };

  // ✅ Siempre renderiza algo (nunca “pantalla vacía”)
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        {t("common.loading", "Cargando…")}
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border rounded-2xl p-6 space-y-5">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold">{t("login.title", "Login")}</h1>
          <LanguageSwitcher />
        </div>

        {errorMsg && (
          <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-800 rounded-lg whitespace-pre-line">
            {errorMsg}
          </div>
        )}

        {infoMsg && (
          <div className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 rounded-lg">
            {infoMsg}
          </div>
        )}

        {mode === "password" ? (
          <form onSubmit={handleSubmitPassword} className="space-y-4">
            <input
              type="email"
              placeholder={t("login.email", "Correo")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-xl p-2"
              autoComplete="email"
            />
            <input
              type="password"
              placeholder={t("login.password", "Contraseña")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-xl p-2"
              autoComplete="current-password"
            />
            <button
              type="submit"
              disabled={loadingAction}
              className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500 transition disabled:opacity-50"
            >
              {loadingAction ? t("login.signingIn", "Entrando…") : t("login.signIn", "Entrar")}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmitMagic} className="space-y-4">
            <input
              type="email"
              placeholder={t("login.email", "Correo")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-xl p-2"
              autoComplete="email"
            />

            <button
              type="submit"
              disabled={loadingAction}
              className="
                w-full
                rounded-xl
                bg-gradient-to-r from-emerald-500 to-emerald-400
                px-4 py-3
                text-sm font-bold
                text-slate-950
                shadow-lg shadow-emerald-500/40
                hover:from-emerald-400 hover:to-emerald-300
                focus:outline-none
                focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2
                disabled:opacity-50
                disabled:shadow-none
                transition
              "
            >
              {loadingAction ? t("login.sending", "Enviando…") : t("login.magicLinkButton", "Enviar enlace mágico")}
            </button>
          </form>
        )}

        <div className="flex gap-4 justify-center pt-2">
          <button
            onClick={() => setMode("password")}
            className={`text-sm underline ${mode === "password" ? "font-semibold" : ""}`}
          >
            {t("login.passwordMode", "Contraseña")}
          </button>
          <button
            onClick={() => setMode("magic")}
            className={`text-sm underline ${mode === "magic" ? "font-semibold" : ""}`}
          >
            {t("login.magicMode", "Link mágico")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
