// src/pages/Login.tsx
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

type Mode = "password" | "magic";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, authReady } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("password");

  const [loadingAction, setLoadingAction] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // 1) Si ya hay sesión, ir a /inicio
  useEffect(() => {
    if (!authReady) return;
    if (session?.user) {
      navigate("/inicio", { replace: true });
    }
  }, [session, authReady, navigate]);

  // 2) Reset mensajes al cambiar de URL
  useEffect(() => {
    setErrorMsg(null);
    setInfoMsg(null);
  }, [location.key]);

  // 3) Modo desde querystring (?mode=magic)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlMode = params.get("mode");
    if (urlMode === "magic") setMode("magic");
    else if (urlMode === "password") setMode("password");
  }, [location.search]);

  // 4) Errores devueltos por Supabase en hash
  useEffect(() => {
    const hash = location.hash || "";
    if (!hash.startsWith("#")) return;

    const raw = hash.slice(1);
    const params = new URLSearchParams(raw);
    const errorCode = params.get("error_code");
    const errorDesc = params.get("error_description");

    if (!errorCode && !errorDesc) return;

    let friendly = t("login.errorMagicLink");

    if ((errorCode || "").toLowerCase().includes("otp_expired")) {
      friendly = t("login.magicExpired");
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
        setErrorMsg(error.message);
        return;
      }

      navigate("/inicio", { replace: true });
    } catch {
      setErrorMsg(t("common.unexpectedError"));
    } finally {
      setLoadingAction(false);
    }
  };

  // LOGIN CON MAGIC LINK
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
        setErrorMsg(error.message);
        return;
      }

      setInfoMsg(t("login.infoMagicLinkSent"));
    } catch {
      setErrorMsg(t("common.unexpectedError"));
    } finally {
      setLoadingAction(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border rounded-2xl p-6 space-y-5">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold">{t("login.title")}</h1>
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
              placeholder={t("login.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-xl p-2"
            />
            <input
              type="password"
              placeholder={t("login.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-xl p-2"
            />
            <button
              type="submit"
              disabled={loadingAction}
              className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500 transition disabled:opacity-50"
            >
              {loadingAction ? t("login.signingIn") : t("login.signIn")}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmitMagic} className="space-y-4">
            <input
              type="email"
              placeholder={t("login.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-xl p-2"
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
              {loadingAction
                ? t("login.sending")
                : t("login.magicLinkButton")}
            </button>
          </form>
        )}

        <div className="flex gap-4 justify-center pt-2">
          <button
            onClick={() => setMode("password")}
            className={`text-sm underline ${
              mode === "password" ? "font-semibold" : ""
            }`}
          >
            {t("login.passwordMode")}
          </button>
          <button
            onClick={() => setMode("magic")}
            className={`text-sm underline ${
              mode === "magic" ? "font-semibold" : ""
            }`}
          >
            {t("login.magicMode")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
