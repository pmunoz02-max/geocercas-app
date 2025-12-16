// src/pages/Login.tsx
import React, { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

type Mode = "password" | "magic";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("password");

  const [loadingAction, setLoadingAction] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const redirectAfterLogin = useCallback(
    async (userId: string, userMetadata?: any) => {
      try {
        const invitedAs =
          (userMetadata?.invited_as || userMetadata?.invited_As || "")
            .toString()
            .toLowerCase();

        const { data: orgs, error: orgErr } = await supabase
          .from("user_organizations")
          .select("role")
          .eq("user_id", userId);

        if (orgErr) console.error("[Login] Error leyendo user_organizations:", orgErr);

        const roles: string[] =
          orgs?.map((o: any) => (o.role ? String(o.role).toLowerCase() : "")) || [];

        const isTracker = roles.includes("tracker") || invitedAs === "tracker";
        const targetPath = isTracker ? "/tracker-gps" : "/inicio";

        if (location.pathname !== targetPath) {
          navigate(targetPath, { replace: true });
        }
      } catch (e) {
        console.error("[Login] Exception redirectAfterLogin:", e);
        if (location.pathname !== "/inicio") navigate("/inicio", { replace: true });
      }
    },
    [navigate, location.pathname]
  );

  useEffect(() => {
    setErrorMsg(null);
    setInfoMsg(null);
  }, [location.key]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlMode = params.get("mode");
    if (urlMode === "magic") setMode("magic");
    else if (urlMode === "password") setMode("password");
  }, [location.search]);

  useEffect(() => {
    const hash = location.hash || "";
    if (!hash.startsWith("#")) return;

    const raw = hash.slice(1);
    const params = new URLSearchParams(raw);
    const error = params.get("error");
    const errorCode = params.get("error_code");
    const errorDesc = params.get("error_description");

    if (!error && !errorCode && !errorDesc) return;

    let friendly =
      t("login.errorMagicLink") || "No se pudo procesar el enlace mágico.";

    if ((errorCode || "").toLowerCase().includes("otp_expired")) {
      friendly =
        t("login.magicExpired") ||
        "El enlace mágico expiró o ya fue usado. Solicita uno nuevo e inténtalo de inmediato.";
    } else if ((errorCode || "").toLowerCase().includes("access_denied")) {
      friendly =
        t("login.magicDenied") ||
        "Acceso denegado al procesar el enlace. Solicita un nuevo enlace mágico.";
    }

    if (errorDesc) {
      friendly += `\n${decodeURIComponent(errorDesc)}`;
    }

    setErrorMsg(friendly);
    setMode("magic");
  }, [location.hash, t]);

  const isPasswordMode = mode === "password";

  useEffect(() => {
    if (loading) return;
    if (session?.user) {
      redirectAfterLogin(session.user.id, session.user.user_metadata);
    }
  }, [session, loading, redirectAfterLogin]);

  const inputBase =
    "w-full rounded-lg border px-3 py-3 text-[15px] leading-5 " +
    "bg-white text-slate-900 placeholder:text-slate-400 " +
    "border-slate-300 " +
    "focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 " +
    "disabled:opacity-60 disabled:cursor-not-allowed";

  // ✅ CAMBIO: azul más claro + texto más “intenso”
  const primaryBtn =
    "w-full inline-flex items-center justify-center gap-2 " +
    "px-4 py-3 rounded-lg text-[15px] font-extrabold tracking-wide " +
    "bg-sky-500 text-white shadow-sm " +
    "hover:bg-sky-400 active:bg-sky-600 " +
    "focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 " +
    "disabled:opacity-60 disabled:cursor-not-allowed";

  // ✅ CAMBIO: “Olvidaste…” con fondo claro y texto más fuerte (sin cambiar lógica)
  const secondaryLink =
    "inline-flex items-center gap-2 text-[14px] font-extrabold tracking-wide " +
    "text-sky-900 " +
    "bg-sky-100 border border-sky-200 " +
    "hover:bg-sky-200 active:bg-sky-300 " +
    "focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 " +
    "rounded-lg px-3 py-2 " +
    "disabled:opacity-60 disabled:cursor-not-allowed";

  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email || !password) {
      setErrorMsg(t("login.errorMissingCredentials") || "Faltan usuario o contraseña.");
      return;
    }

    try {
      setLoadingAction(true);

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error("[Login] signInWithPassword error:", error);
        setErrorMsg(error.message || t("login.errorInvalidCredentials") || "Credenciales inválidas.");
        return;
      }

      const user = data.user;
      if (user) await redirectAfterLogin(user.id, user.user_metadata);
      else navigate("/inicio", { replace: true });
    } catch (err: any) {
      console.error("[Login] signInWithPassword exception:", err);
      setErrorMsg(t("login.errorUnexpected") || "Error inesperado al iniciar sesión.");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleSubmitMagic = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email) {
      setErrorMsg(t("login.errorMissingEmail") || "Debes ingresar un correo.");
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
        console.error("[Login] signInWithOtp error:", error);
        const msg = (error.message || "").toLowerCase();

        if (
          msg.includes("signup") ||
          msg.includes("sign up") ||
          msg.includes("new user") ||
          msg.includes("not found")
        ) {
          setErrorMsg(
            t("login.userNotAuthorized") ||
              "Este correo no está autorizado. Solicita una invitación al administrador."
          );
        } else {
          setErrorMsg(error.message || t("login.errorMagicLink") || "No se pudo enviar el enlace mágico.");
        }
        return;
      }

      setInfoMsg(t("login.infoMagicLinkSent") || "Hemos enviado un enlace mágico a tu correo.");
    } catch (err: any) {
      console.error("[Login] signInWithOtp exception:", err);
      setErrorMsg(t("login.errorMagicLinkUnexpected") || "Error inesperado al enviar el enlace mágico.");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleForgotPassword = async () => {
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email) {
      setErrorMsg(t("login.errorMissingEmail") || "Debes ingresar un correo.");
      return;
    }

    try {
      setLoadingAction(true);
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

      if (error) {
        console.error("[Login] resetPasswordForEmail error:", error);
        setErrorMsg(error.message || t("login.errorResetPassword") || "No se pudo enviar el correo de recuperación.");
        return;
      }

      setInfoMsg(
        t("login.infoResetPasswordSent") ||
          "Te enviamos un correo para restablecer tu contraseña. Revisa tu bandeja de entrada."
      );
    } catch (err: any) {
      console.error("[Login] resetPasswordForEmail exception:", err);
      setErrorMsg(
        t("login.errorResetPasswordUnexpected") ||
          "Error inesperado al enviar el correo de recuperación."
      );
    } finally {
      setLoadingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-700">
          {t("login.loadingSession") || "Cargando tu sesión…"}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">
              {t("login.title") || "Iniciar sesión"}
            </h1>
            <p className="text-sm text-slate-600">
              {t("login.subtitle") || "Accede a tu cuenta de App Geocercas"}
            </p>
          </div>
          <div className="shrink-0">
            <LanguageSwitcher />
          </div>
        </div>

        <div
          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-1.5"
          role="tablist"
          aria-label={t("login.modeLabel") || "Modo de inicio de sesión"}
        >
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setMode("password")}
              disabled={loadingAction}
              role="tab"
              aria-selected={isPasswordMode}
              className={[
                "w-full rounded-lg px-3 py-2.5 text-[14px] font-semibold transition",
                "focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2",
                loadingAction ? "opacity-70 cursor-not-allowed" : "",
                isPasswordMode
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-slate-900",
              ].join(" ")}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <span aria-hidden="true">🔒</span>
                {t("login.modePassword") || "Contraseña"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMode("magic")}
              disabled={loadingAction}
              role="tab"
              aria-selected={!isPasswordMode}
              className={[
                "w-full rounded-lg px-3 py-2.5 text-[14px] font-semibold transition",
                "focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2",
                loadingAction ? "opacity-70 cursor-not-allowed" : "",
                !isPasswordMode
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-slate-900",
              ].join(" ")}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <span aria-hidden="true">✉️</span>
                {t("login.modeMagic") || "Link mágico"}
              </span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 whitespace-pre-line"
            role="alert"
          >
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5">
                ⚠️
              </span>
              <div>{errorMsg}</div>
            </div>
          </div>
        )}

        {infoMsg && (
          <div
            className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 whitespace-pre-line"
            role="status"
          >
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5">
                ✅
              </span>
              <div>{infoMsg}</div>
            </div>
          </div>
        )}

        {isPasswordMode && (
          <form onSubmit={handleSubmitPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">
                {t("login.emailLabel") || "Correo electrónico"}
              </label>
              <input
                type="email"
                autoComplete="email"
                name="login-email"
                className={inputBase}
                placeholder={t("login.emailPlaceholder") || "tucorreo@ejemplo.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loadingAction}
                inputMode="email"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">
                {t("login.passwordLabel") || "Contraseña"}
              </label>
              <input
                type="password"
                autoComplete="current-password"
                name="login-password"
                className={inputBase}
                placeholder={t("login.passwordPlaceholder") || "Ingresa tu contraseña"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loadingAction}
              />

              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loadingAction}
                  className={secondaryLink}
                >
                  <span aria-hidden="true">↻</span>
                  {t("login.forgotPassword") || "¿Olvidaste tu contraseña?"}
                </button>
                <p className="mt-1 text-xs text-slate-500">
                  {t("login.resetHint") ||
                    "Te enviaremos un correo con el enlace para crear una nueva contraseña."}
                </p>
              </div>
            </div>

            <button type="submit" disabled={loadingAction} className={primaryBtn}>
              {loadingAction ? (
                <>
                  <span aria-hidden="true" className="animate-spin">
                    ⏳
                  </span>
                  {t("login.submitting") || "Ingresando…"}
                </>
              ) : (
                <>
                  <span aria-hidden="true">➡️</span>
                  {t("login.submit") || "Entrar"}
                </>
              )}
            </button>
          </form>
        )}

        {!isPasswordMode && (
          <form onSubmit={handleSubmitMagic} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">
                {t("login.emailLabel") || "Correo electrónico"}
              </label>
              <input
                type="email"
                autoComplete="email"
                name="login-magic-email"
                className={inputBase}
                placeholder={t("login.emailPlaceholder") || "tucorreo@ejemplo.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loadingAction}
                inputMode="email"
              />
            </div>

            <button type="submit" disabled={loadingAction} className={primaryBtn}>
              {loadingAction ? (
                <>
                  <span aria-hidden="true" className="animate-spin">
                    ⏳
                  </span>
                  {t("login.magicSubmitting") || "Enviando enlace…"}
                </>
              ) : (
                <>
                  <span aria-hidden="true">✉️</span>
                  {t("login.magicButton") || "Enviar link mágico"}
                </>
              )}
            </button>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-600">
                {t("login.magicDescription") ||
                  "Te enviaremos un enlace seguro a tu correo para que ingreses sin contraseña."}
              </p>
            </div>

            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loadingAction}
              className="w-full rounded-lg border border-sky-200 bg-sky-100 px-4 py-3 text-[14px] font-extrabold tracking-wide text-sky-900
                         hover:bg-sky-200 active:bg-sky-300
                         focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2
                         disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {t("login.forgotPasswordAlt") || "Prefiero restablecer mi contraseña (enviar correo)"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
