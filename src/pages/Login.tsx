// src/pages/Login.tsx
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
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
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Lee mode de query (?mode=magic)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const m = params.get("mode");
    if (m === "magic") setMode("magic");
    else setMode("password");
  }, [location.search]);

  // Si ya hay sesión, no mostrar login
  useEffect(() => {
    if (!authReady) return;
    if (session) navigate("/inicio", { replace: true });
  }, [authReady, session, navigate]);

  const normEmail = (v: string) => String(v || "").trim().toLowerCase();
  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  // ---------------- PASSWORD LOGIN ----------------
  const onPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setOkMsg(null);

    const em = normEmail(email);
    if (!em || !isValidEmail(em)) {
      setErrorMsg(t("login.invalidEmail", { defaultValue: "Correo inválido." }));
      return;
    }
    if (!password) {
      setErrorMsg(t("login.invalidPassword", { defaultValue: "Contraseña requerida." }));
      return;
    }

    try {
      setLoadingAction(true);
      const { error } = await supabase.auth.signInWithPassword({ email: em, password });
      if (error) throw error;
      navigate("/inicio", { replace: true });
    } catch (err: any) {
      console.error("[Login] password error", err);
      setErrorMsg(err?.message || t("login.error", { defaultValue: "No se pudo ingresar." }));
    } finally {
      setLoadingAction(false);
    }
  };

  // ---------------- MAGIC LINK ----------------
  const onMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setOkMsg(null);

    const em = normEmail(email);
    if (!em || !isValidEmail(em)) {
      setErrorMsg(t("login.invalidEmail", { defaultValue: "Correo inválido." }));
      return;
    }

    try {
      setLoadingAction(true);
      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOtp({
        email: em,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;

      setOkMsg(
        t("login.magicSent", {
          defaultValue: "Te enviamos un enlace de acceso. Revisa tu correo.",
        })
      );
    } catch (err: any) {
      console.error("[Login] magic error", err);
      setErrorMsg(err?.message || t("login.error", { defaultValue: "No se pudo enviar el enlace." }));
    } finally {
      setLoadingAction(false);
    }
  };

  // ---------------- RECUPERAR CONTRASEÑA ----------------
 <button
  type="button"
  onClick={onRecoverPassword}
  disabled={loadingAction}
  className="
    text-sm
    text-sky-300
    hover:text-sky-200
    hover:underline
    transition
    disabled:opacity-50
  "
>
  ¿Olvidaste tu contraseña?
</button>

    try {
      setLoadingAction(true);
      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.resetPasswordForEmail(em, {
        redirectTo,
      });

      if (error) throw error;

      setOkMsg(
        t("login.recoverySent", {
          defaultValue:
            "Te enviamos un correo para recuperar tu contraseña. Revisa tu bandeja de entrada.",
        })
      );
    } catch (err: any) {
      console.error("[Login] recovery error", err);
      setErrorMsg(
        err?.message ||
          t("login.recoveryError", { defaultValue: "No se pudo enviar el correo de recuperación." })
      );
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <Link to="/" className="text-white/70 hover:text-white text-sm underline">
            {t("login.backHome", { defaultValue: "Volver" })}
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="rounded-3xl bg-white/5 border border-white/10 p-6">
          <h1 className="text-xl font-bold">
            {mode === "magic"
              ? t("login.magicTitle", { defaultValue: "Entrar con Magic Link" })
              : t("login.passwordTitle", { defaultValue: "Entrar" })}
          </h1>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setMode("password")}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                mode === "password"
                  ? "bg-white text-slate-900 border-white"
                  : "bg-white/10 text-white border-white/10 hover:bg-white/15"
              }`}
              type="button"
            >
              {t("login.passwordMode", { defaultValue: "Contraseña" })}
            </button>

            <button
              onClick={() => setMode("magic")}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                mode === "magic"
                  ? "bg-white text-slate-900 border-white"
                  : "bg-white/10 text-white border-white/10 hover:bg-white/15"
              }`}
              type="button"
            >
              {t("login.magicMode", { defaultValue: "Magic Link" })}
            </button>
          </div>

          <form className="mt-6" onSubmit={mode === "magic" ? onMagicLink : onPasswordLogin}>
            <label className="block text-xs text-white/70 mb-2">
              {t("login.email", { defaultValue: "Correo" })}
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="w-full rounded-xl bg-white/10 border border-white/10 px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="correo@ejemplo.com"
            />

            {mode === "password" && (
              <>
                <label className="block text-xs text-white/70 mb-2 mt-4">
                  {t("login.password", { defaultValue: "Contraseña" })}
                </label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  className="w-full rounded-xl bg-white/10 border border-white/10 px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="••••••••"
                />

                {/* 🔐 Recuperar contraseña */}
                <div className="mt-3 text-right">
                  <button
                    type="button"
                    onClick={onRecoverPassword}
                    disabled={loadingAction}
                    className="text-xs text-sky-400 hover:underline disabled:opacity-60"
                  >
                    {t("login.forgotPassword", {
                      defaultValue: "¿Olvidaste tu contraseña?",
                    })}
                  </button>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loadingAction}
              className="mt-5 w-full px-4 py-2.5 rounded-xl font-semibold bg-white text-slate-900 hover:bg-white/90 disabled:opacity-60 transition"
            >
              {loadingAction
                ? t("login.working", { defaultValue: "Procesando…" })
                : mode === "magic"
                ? t("login.sendMagic", { defaultValue: "Enviar Magic Link" })
                : t("login.signIn", { defaultValue: "Entrar" })}
            </button>

            {okMsg && <div className="mt-4 text-sm text-emerald-300">{okMsg}</div>}
            {errorMsg && <div className="mt-4 text-sm text-red-300">{errorMsg}</div>}
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
