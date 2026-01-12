// src/pages/Landing.jsx
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";
import LanguageSwitcher from "../components/LanguageSwitcher";

/**
 * Landing UNIVERSAL:
 * - Público: NO consulta sesión, NO usa useAuth, NO hace getSession.
 * - ES/EN/FR siempre visible (LanguageSwitcher)
 * - Navegación SPA con <Link>
 * - i18n robusto: fallback si falta traducción
 */

function safeT(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string") {
    const s = value.trim();
    return s && s !== fallback ? s : fallback;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export default function Landing() {
  const { t } = useTranslation();

  // helper i18n: nunca mostrar la key
  const tt = useMemo(() => {
    return (key, fallback) => {
      const v = t(key, { defaultValue: fallback });
      return !v || v === key ? fallback : v;
    };
  }, [t]);

  const [email, setEmail] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const normEmail = (v) => String(v || "").trim().toLowerCase();
  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const handleSendMagicLink = async (e) => {
    e.preventDefault();
    setStatusMsg("");
    setErrorMsg("");

    const em = normEmail(email);
    if (!em || !isValidEmail(em)) {
      setErrorMsg(tt("landing.invalidEmail", "Correo inválido."));
      return;
    }

    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOtp({
        email: em,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;

      setStatusMsg(tt("landing.magicLinkSent", "Te enviamos un enlace de acceso. Revisa tu correo."));
    } catch (err) {
      console.error("[Landing] signInWithOtp error", err);
      setErrorMsg(tt("landing.magicLinkError", "No se pudo enviar el enlace. Intenta nuevamente."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="w-full border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center font-bold">
              AG
            </div>
            <div className="leading-tight">
              <div className="font-semibold">{safeT(tt("landing.brandName", "App Geocercas"), "App Geocercas")}</div>
              <div className="text-xs text-white/60">
                {safeT(tt("landing.brandTagline", "Control de personal por geocercas"), "Control de personal por geocercas")}
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
              {safeT(tt("landing.login", "Entrar"), "Entrar")}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
              {safeT(
                tt("landing.heroTitle", "Controla a tu personal con geocercas inteligentes en cualquier parte del mundo"),
                "Controla a tu personal con geocercas inteligentes en cualquier parte del mundo"
              )}
            </h1>

            <p className="mt-5 text-white/70 text-base sm:text-lg leading-relaxed">
              {safeT(
                tt(
                  "landing.heroSubtitle",
                  "App Geocercas te permite asignar personas a zonas, registrar actividades y calcular costos en tiempo real."
                ),
                "App Geocercas te permite asignar personas a zonas, registrar actividades y calcular costos en tiempo real."
              )}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/login"
                className="px-5 py-2.5 rounded-full font-semibold bg-emerald-600 hover:bg-emerald-500 transition"
              >
                {safeT(tt("landing.goPanel", "Ir al panel de control"), "Ir al panel de control")}
              </Link>

              <Link
                to="/login?mode=magic"
                className="px-5 py-2.5 rounded-full font-semibold bg-white/10 hover:bg-white/15 border border-white/10 transition"
              >
                {safeT(tt("landing.magicEnter", "Entrar con link mágico"), "Entrar con link mágico")}
              </Link>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
            <h2 className="text-xl font-bold">{safeT(tt("landing.quickAccessTitle", "Acceso rápido"), "Acceso rápido")}</h2>

            <p className="mt-2 text-sm text-white/70">
              {safeT(
                tt("landing.quickAccessDesc", "Si prefieres, puedes ingresar con Magic Link (sin contraseña)."),
                "Si prefieres, puedes ingresar con Magic Link (sin contraseña)."
              )}
            </p>

            <form onSubmit={handleSendMagicLink} className="mt-6">
              <label className="block text-xs text-white/70 mb-2">
                {safeT(tt("landing.email", "Correo"), "Correo")}
              </label>

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
                {loading ? safeT(tt("landing.sending", "Enviando..."), "Enviando...") : safeT(tt("landing.sendMagic", "Enviar Magic Link"), "Enviar Magic Link")}
              </button>

              {statusMsg && <div className="mt-4 text-sm text-emerald-300">{statusMsg}</div>}
              {errorMsg && <div className="mt-4 text-sm text-red-300">{errorMsg}</div>}

              <p className="mt-4 text-xs text-white/50">
                {safeT(tt("landing.magicNote", "Importante: el acceso funciona solo con el Magic Link real."), "Importante: el acceso funciona solo con el Magic Link real.")}
              </p>

              <Link className="mt-2 inline-block text-xs text-white/60 underline" to="/help/support">
                {safeT(tt("landing.support", "Soporte"), "Soporte")}
              </Link>
            </form>
          </div>
        </div>

        <footer className="mt-14 pt-6 border-t border-white/10 text-xs text-white/50 flex items-center justify-between">
          <span>© {new Date().getFullYear()} {safeT(tt("landing.brandName", "App Geocercas"), "App Geocercas")}</span>
          <span>Fenice Ecuador S.A.S.</span>
        </footer>
      </main>
    </div>
  );
}
