// src/pages/Landing.jsx
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";
import LanguageSwitcher from "../components/LanguageSwitcher";

/**
 * Landing UNIVERSAL:
 * - Público: NO consulta sesión, NO usa useAuth
 * - ES/EN/FR visibles (LanguageSwitcher)
 * - Navegación interna SPA (Link)
 * - i18n robusto: si falta key => fallback real
 */
export default function Landing() {
  const { t } = useTranslation();

  const tt = useMemo(() => {
    return (key, fallback) => {
      const v = t(key, { defaultValue: fallback });
      return !v || v === key ? fallback : v;
    };
  }, [t]);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [okMsg, setOkMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");

  const normEmail = (v) => String(v || "").trim().toLowerCase();
  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const sendMagic = async (e) => {
    e.preventDefault();
    setOkMsg("");
    setErrMsg("");

    const em = normEmail(email);
    if (!em || !isValidEmail(em)) {
      setErrMsg(tt("landing.invalidEmail", "Correo inválido."));
      return;
    }

    try {
      setLoading(true);
      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOtp({
        email: em,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;

      setOkMsg(tt("landing.magicLinkSent", "Te enviamos un enlace de acceso. Revisa tu correo."));
    } catch (err) {
      console.error("[Landing] signInWithOtp error:", err);
      setErrMsg(tt("landing.magicLinkError", "No se pudo enviar el enlace. Intenta nuevamente."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="w-full border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center font-bold">
              AG
            </div>
            <div className="leading-tight">
              <div className="font-semibold">{tt("landing.brandName", "App Geocercas")}</div>
              <div className="text-xs text-white/60">
                {tt("landing.brandTagline", "Control de personal por geocercas")}
              </div>
            </div>
          </div>

          {/* ✅ ES/EN/FR + Entrar */}
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              to="/login"
              className="px-3 py-1.5 rounded-full text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10 transition"
            >
              {tt("landing.login", "Entrar")}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
              {tt(
                "landing.heroTitle",
                "Controla a tu personal con geocercas inteligentes en cualquier parte del mundo"
              )}
            </h1>

            <p className="mt-5 text-white/70 text-base sm:text-lg leading-relaxed">
              {tt(
                "landing.heroSubtitle",
                "App Geocercas te permite asignar personas a zonas, registrar actividades y calcular costos en tiempo real."
              )}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/login"
                className="px-5 py-2.5 rounded-full font-semibold bg-emerald-600 hover:bg-emerald-500 transition"
              >
                {tt("landing.goPanel", "Ir al panel de control")}
              </Link>

              <Link
                to="/login?mode=magic"
                className="px-5 py-2.5 rounded-full font-semibold bg-white/10 hover:bg-white/15 border border-white/10 transition"
              >
                {tt("landing.magicEnter", "Entrar con link mágico")}
              </Link>
            </div>
          </div>

          {/* Quick Access */}
          <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
            <h2 className="text-xl font-bold">{tt("landing.quickAccessTitle", "Acceso rápido")}</h2>
            <p className="mt-2 text-sm text-white/70">
              {tt("landing.quickAccessDesc", "Si prefieres, puedes ingresar con Magic Link (sin contraseña).")}
            </p>

            <form onSubmit={sendMagic} className="mt-6">
              <label className="block text-xs text-white/70 mb-2">{tt("landing.email", "Correo")}</label>

              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="correo@ejemplo.com"
                className="w-full rounded-xl bg-white/10 border border-white/10 px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />

              <button
                type="submit"
                disabled={loading}
                className="mt-4 w-full px-4 py-2.5 rounded-xl font-semibold bg-white text-slate-900 hover:bg-white/90 disabled:opacity-60 transition"
              >
                {loading ? tt("landing.sending", "Enviando…") : tt("landing.sendMagic", "Enviar Magic Link")}
              </button>

              {okMsg && <div className="mt-4 text-sm text-emerald-300">{okMsg}</div>}
              {errMsg && <div className="mt-4 text-sm text-red-300">{errMsg}</div>}

              <p className="mt-4 text-xs text-white/50">
                {tt("landing.magicNote", "Importante: el acceso funciona solo con el Magic Link real.")}
              </p>

              <Link className="mt-2 inline-block text-xs text-white/60 underline" to="/help/support">
                {tt("landing.support", "Soporte")}
              </Link>
            </form>
          </div>
        </div>

        <footer className="mt-14 pt-6 border-t border-white/10 text-xs text-white/50 flex items-center justify-between">
          <span>© {new Date().getFullYear()} {tt("landing.brandName", "App Geocercas")}</span>
          <span>Fenice Ecuador S.A.S.</span>
        </footer>
      </main>
    </div>
  );
}
