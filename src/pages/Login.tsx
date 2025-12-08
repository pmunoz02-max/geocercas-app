// src/pages/Login.tsx
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// 👇 Rutas corregidas (estás dentro de src/pages)
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

  // 🔹 Al abrir /login limpiamos siempre email y password
  useEffect(() => {
    setEmail("");
    setPassword("");
  }, []);

  // Leer ?mode=magic de la URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlMode = params.get("mode");
    if (urlMode === "magic") {
      setMode("magic");
    }
  }, [location.search]);

  const isPasswordMode = mode === "password";

  const handleGoToDashboard = () => {
    navigate("/inicio", { replace: true });
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("[Login] signOut error:", e);
    } finally {
      navigate("/login", { replace: true });
    }
  };

  // Login con email + contraseña
  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email || !password) {
      setErrorMsg(t("login.errorMissingCredentials"));
      return;
    }

    try {
      setLoadingAction(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("[Login] signInWithPassword error:", error);
        setErrorMsg(error.message || t("login.errorInvalidCredentials"));
        return;
      }

      navigate("/inicio", { replace: true });
    } catch (err: any) {
      console.error("[Login] signInWithPassword exception:", err);
      setErrorMsg(t("login.errorUnexpected"));
    } finally {
      setLoadingAction(false);
    }
  };

  // Magic Link clásico (owner/admin)
  const handleSubmitMagic = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email) {
      setErrorMsg(t("login.errorMissingEmail"));
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
        setErrorMsg(error.message || t("login.errorMagicLink"));
        return;
      }

      setInfoMsg(t("login.infoMagicLinkSent"));
    } catch (err: any) {
      console.error("[Login] signInWithOtp exception:", err);
      setErrorMsg(t("login.errorMagicLinkUnexpected"));
    } finally {
      setLoadingAction(false);
    }
  };

  // Mientras AuthContext resuelve la sesión
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          {t("login.loadingSession")}
        </div>
      </div>
    );
  }

  // Si ya hay sesión activa y entran manualmente a /login
  if (session) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-slate-50">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                {t("login.alreadyLoggedInTitle")}
              </h1>
              <p className="text-sm text-slate-600">
                {t("login.alreadyLoggedInBody")}
              </p>
            </div>
            <LanguageSwitcher />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleGoToDashboard}
              className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {t("login.goToDashboard")}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              {t("login.logout")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Formulario normal sin sesión
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
        {/* Encabezado + selector idioma */}
        <div className="flex items-center justify-between mb-2">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">
              {t("login.title")}
            </h1>
            <p className="text-sm text-slate-600">{t("login.subtitle")}</p>
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
            {t("login.modePassword")}
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
            {t("login.modeMagic")}
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
                {t("login.emailLabel")}
              </label>
              <input
                type="email"
                autoComplete="email"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder={t("login.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loadingAction}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t("login.passwordLabel")}
              </label>
              <input
                type="password"
                autoComplete="current-password"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder={t("login.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loadingAction}
              />
            </div>
            <button
              type="submit"
              disabled={loadingAction}
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingAction ? t("login.submitting") : t("login.submit")}
            </button>
          </form>
        )}

        {/* Formulario Magic Link */}
        {!isPasswordMode && (
          <form onSubmit={handleSubmitMagic} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t("login.emailLabel")}
              </label>
              <input
                type="email"
                autoComplete="email"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder={t("login.emailPlaceholder")}
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
                ? t("login.magicSubmitting")
                : t("login.magicButton")}
            </button>
            <p className="text-[11px] text-slate-500">
              {t("login.magicDescription")}
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
