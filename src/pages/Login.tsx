// src/pages/Login.tsx
// LOGIN-V32 (Supabase Auth) — unificado, crea sb-*-auth-token y habilita RLS
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const next = useMemo(() => searchParams.get("next") || "/inicio", [searchParams]);

  const { authenticated, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("pruebatugeo@gmail.com");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Si ya hay sesión, fuera del login
    if (!authLoading && authenticated) {
      navigate(next, { replace: true });
    }
  }, [authLoading, authenticated, navigate, next]);

  const inputClass =
    "w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 " +
    "text-white placeholder:text-slate-400 outline-none";

  const buttonClass =
    "w-full mt-8 py-4 rounded-2xl bg-white/90 text-slate-900 font-semibold text-center " +
    "active:bg-white select-none disabled:opacity-60 disabled:cursor-not-allowed";

  const linkClass = "text-xs underline opacity-80 hover:opacity-100";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: String(email || "").trim(),
        password: String(password || ""),
      });

      if (error) {
        setErrorMsg(error.message || "Login failed");
        return;
      }

      // ✅ si hay sesión, ya existe sb-*-auth-token (persistSession=true)
      if (data?.session) {
        navigate(next, { replace: true });
        return;
      }

      // Caso raro: sin sesión
      setErrorMsg(t("login.noSession", { defaultValue: "No se creó sesión. Reintenta." }));
    } catch (err: any) {
      setErrorMsg(err?.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-4 px-1">
          <Link to="/" className={linkClass}>
            {t("login.back", { defaultValue: "Volver" })}
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <h1 className="text-3xl font-semibold mb-6">
            {t("login.title", { defaultValue: "Iniciar sesión" })}{" "}
            <span className="text-xs opacity-60">
              {t("login.badge", { defaultValue: "(LOGIN-V32 Supabase Auth)" })}
            </span>
          </h1>

          <div className="mb-6 text-xs p-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-100">
            {t("login.info", {
              defaultValue:
                "Login unificado con Supabase Auth: crea sesión persistente (sb-*-auth-token) y habilita RLS automáticamente.",
            })}
          </div>

          {errorMsg ? (
            <div className="mb-5 text-xs p-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 text-rose-100">
              {errorMsg}
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            <input type="hidden" name="next" value={next} />

            <label className="block mb-2 text-sm">
              {t("login.email", { defaultValue: "Correo" })}
            </label>
            <input
              className={inputClass}
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <div className="h-6" />

            <label className="block mb-2 text-sm">
              {t("login.password", { defaultValue: "Contraseña" })}
            </label>
            <input
              className={inputClass}
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button type="submit" className={buttonClass} disabled={submitting}>
              {submitting
                ? t("login.submitting", { defaultValue: "Entrando..." })
                : t("login.submit", { defaultValue: "Entrar" })}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-xs px-1">
            <Link to="/forgot-password" className={linkClass}>
              {t("login.forgot", { defaultValue: "¿Olvidaste tu contraseña?" })}
            </Link>

            <Link to="/reset-password" className={`${linkClass} opacity-60`}>
              {t("login.reset", { defaultValue: "Ya tengo el link" })}
            </Link>
          </div>

          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4">
            <div>
              {t("login.modeTitle", {
                defaultValue: "Modo: Supabase Auth (persistSession)",
              })}
            </div>
            <div>
              {t("login.modeDesc", {
                defaultValue:
                  "Después del login, verifica localStorage: debe existir sb-*-auth-token. Si existe, RLS permitirá INSERT/UPDATE según policies.",
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
