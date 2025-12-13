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

  // ------------------------------------------------------------
  // Redirección universal después de login:
  //  - Si tiene rol TRACKER → /tracker-gps
  //  - Si no → /inicio
  //  Además: NO navega si ya está en ese path (para evitar bucles)
  // ------------------------------------------------------------
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

        if (orgErr) {
          console.error("[Login] Error leyendo user_organizations:", orgErr);
        }

        const roles: string[] =
          orgs?.map((o: any) => (o.role ? String(o.role).toLowerCase() : "")) ||
          [];

        const isTracker = roles.includes("tracker") || invitedAs === "tracker";

        let targetPath = "/inicio";
        if (isTracker) targetPath = "/tracker-gps";

        // Evitar bucles de navegación
        if (location.pathname !== targetPath) {
          navigate(targetPath, { replace: true });
        }
      } catch (e) {
        console.error("[Login] Exception redirectAfterLogin:", e);
        if (location.pathname !== "/inicio") {
          navigate("/inicio", { replace: true });
        }
      }
    },
    [navigate, location.pathname]
  );

  // Limpiar campos al cambiar de ruta
  useEffect(() => {
    setEmail("");
    setPassword("");
    setErrorMsg(null);
    setInfoMsg(null);
  }, [location.key]);

  // Leer ?mode=magic de la URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlMode = params.get("mode");
    if (urlMode === "magic") {
      setMode("magic");
    } else if (urlMode === "password") {
      setMode("password");
    }
  }, [location.search]);

  const isPasswordMode = mode === "password";

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("[Login] signOut error:", e);
    } finally {
      navigate("/login", { replace: true });
    }
  };

  // Si ya hay sesión y abren /login, decidir destino según rol
  useEffect(() => {
    if (loading) return;

    if (session?.user) {
      redirectAfterLogin(session.user.id, session.user.user_metadata);
    }
  }, [session, loading, redirectAfterLogin]);

  // LOGIN con contraseña
  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email || !password) {
      setErrorMsg(
        t("login.errorMissingCredentials") || "Faltan usuario o contraseña."
      );
      return;
    }

    try {
      setLoadingAction(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("[Login] signInWithPassword error:", error);
        setErrorMsg(
          error.message ||
            (t("login.errorInvalidCredentials") as string) ||
            "Credenciales inválidas."
        );
        return;
      }

      const user = data.user;
      if (user) {
        await redirectAfterLogin(user.id, user.user_metadata);
      } else {
        if (location.pathname !== "/inicio") {
          navigate("/inicio", { replace: true });
        }
      }
    } catch (err: any) {
      console.error("[Login] signInWithPassword exception:", err);
      setErrorMsg(
        t("login.errorUnexpected") || "Error inesperado al iniciar sesión."
      );
    } finally {
      setLoadingAction(false);
    }
  };

  // MAGIC LINK → redirige a /auth/callback, que decide después
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

        const msg = error.message?.toLowerCase() ?? "";
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
          setErrorMsg(
            error.message ||
              (t("login.errorMagicLink") as string) ||
              "No se pudo enviar el enlace mágico."
          );
        }

        return;
      }

      setInfoMsg(
        t("login.infoMagicLinkSent") || "Hemos enviado un enlace mágico a tu correo."
      );
    } catch (err: any) {
      console.error("[Login] signInWithOtp exception:", err);
      setErrorMsg(
        t("login.errorMagicLinkUnexpected") ||
          "Error inesperado al enviar el enlace mágico."
      );
    } finally {
      setLoadingAction(false);
    }
  };

  // ✅ RESET PASSWORD (envía correo)
  const handleForgotPassword = async () => {
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email) {
      setErrorMsg(t("login.errorMissingEmail") || "Debes ingresar un correo.");
      return;
    }

    try {
      setLoadingAction(true);

      // A dónde vuelve el usuario después de abrir el link de recuperación
      // (en el próximo paso creamos esta página)
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        console.error("[Login] resetPasswordForEmail error:", error);
        setErrorMsg(
          error.message ||
            (t("login.errorResetPassword") as string) ||
            "No se pudo enviar el correo de recuperación."
        );
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

  // Mientras AuthContext resuelve la sesión inicial
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          {t("login.loadingSession") || "Cargando tu sesión…"}
        </div>
      </div>
    );
  }

  // Formulario normal (sin sesión activa)
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
        {/* Encabezado + idioma */}
        <div className="flex items-center justify-between mb-2">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">
              {t("login.title") || "Iniciar sesión"}
            </h1>
            <p className="text-sm text-slate-600">
              {t("login.subtitle") || "Accede a tu cuenta de App Geocercas."}
            </p>
          </div>
          <LanguageSwitcher />
        </div>

        {/* Toggle Password / Magic */}
        <div className="inline-flex items-center rounded-full bg-slate-100 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode("password")}
            className={`flex-1 px-3 py-1.5 rounded-full transition-colors ${
              isPasswordMode
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t("login.modePassword") || "Contraseña"}
          </button>
          <button
            type="button"
            onClick={() => setMode("magic")}
            className={`flex-1 px-3 py-1.5 rounded-full transition-colors ${
              !isPasswordMode
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t("login.modeMagic") || "Enlace mágico"}
          </button>
        </div>

        {/* Mensajes */}
        {errorMsg && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 whitespace-pre-line">
            {errorMsg}
          </div>
        )}
        {infoMsg && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {infoMsg}
          </div>
        )}

        {/* Formulario password */}
        {isPasswordMode && (
          <form onSubmit={handleSubmitPassword} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t("login.emailLabel") || "Correo electrónico"}
              </label>
              <input
                type="email"
                autoComplete="off"
                name="login-email"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder={t("login.emailPlaceholder") || "tucorreo@ejemplo.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loadingAction}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t("login.passwordLabel") || "Contraseña"}
              </label>
              <input
                type="password"
                autoComplete="off"
                name="login-password"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder={t("login.passwordPlaceholder") || "Ingresa tu contraseña"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loadingAction}
              />

              {/* ✅ Botón para recuperar contraseña */}
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loadingAction}
                  className="text-xs text-emerald-700 hover:text-emerald-800 hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {t("login.forgotPassword") || "¿Olvidaste tu contraseña?"}
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-[11px] text-slate-400 hover:text-slate-600"
                  style={{ display: "none" }}
                >
                  {/* (Se deja oculto: útil si luego quieres un botón de “cerrar sesión” aquí) */}
                  Logout
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loadingAction}
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingAction ? t("login.submitting") || "Ingresando…" : t("login.submit") || "Entrar"}
            </button>
          </form>
        )}

        {/* Formulario Magic Link */}
        {!isPasswordMode && (
          <form onSubmit={handleSubmitMagic} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t("login.emailLabel") || "Correo electrónico"}
              </label>
              <input
                type="email"
                autoComplete="off"
                name="login-magic-email"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder={t("login.emailPlaceholder") || "tucorreo@ejemplo.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loadingAction}
              />
            </div>

            <button
              type="submit"
              disabled={loadingAction}
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingAction
                ? t("login.magicSubmitting") || "Enviando enlace…"
                : t("login.magicButton") || "Enviar enlace mágico"}
            </button>

            <p className="text-[11px] text-slate-500">
              {t("login.magicDescription") ||
                "Te enviaremos un enlace seguro a tu correo para que ingreses sin contraseña."}
            </p>

            {/* También útil en modo magic: “olvidé contraseña” para quien intenta entrar */}
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loadingAction}
              className="text-xs text-slate-600 hover:text-slate-800 hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {t("login.forgotPasswordAlt") || "¿Prefieres restablecer tu contraseña? (enviar correo)"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
