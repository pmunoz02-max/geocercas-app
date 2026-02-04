// src/pages/Landing.jsx
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { SUPPORTED } from "../i18n/index.js";

function safeT(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string") {
    const s = value.trim();
    return s ? s : fallback;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function cx(...arr) {
  return arr.filter(Boolean).join(" ");
}

function LangPill({ lng, current, onClick }) {
  const active = current === lng;
  return (
    <button
      type="button"
      onClick={() => onClick(lng)}
      className={cx(
        "px-3 py-1.5 rounded-full text-xs font-bold tracking-wide transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70",
        active
          ? "bg-emerald-500 text-slate-950"
          : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10"
      )}
      aria-pressed={active}
    >
      {lng.toUpperCase()}
    </button>
  );
}

export default function Landing() {
  const { t, i18n } = useTranslation();

  const tt = useMemo(() => {
    return (key, fallback) => {
      const v = t(key, { defaultValue: fallback });
      return !v || v === key ? fallback : v;
    };
  }, [t]);

  const lang = String(i18n.language || "es").slice(0, 2);
  const setLang = (lng) => {
    const code = String(lng || "es").toLowerCase().slice(0, 2);
    if (!SUPPORTED.includes(code)) return;
    i18n.changeLanguage(code);
  };

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
    <div className="min-h-screen text-white bg-slate-950">
      {/* fondo sutil */}
      <div className="pointer-events-none fixed inset-0 opacity-40">
        <div className="absolute -top-40 -left-40 w-[520px] h-[520px] bg-emerald-500/25 blur-3xl rounded-full" />
        <div className="absolute -bottom-48 -right-40 w-[560px] h-[560px] bg-cyan-500/15 blur-3xl rounded-full" />
      </div>

      <header className="relative w-full border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center font-extrabold text-slate-950">
              AG
            </div>
            <div className="leading-tight">
              <div className="font-bold">
                {safeT(tt("landing.brandName", "App Geocercas"), "App Geocercas")}
              </div>
              <div className="text-xs text-white/60">
                {safeT(tt("landing.brandTagline", "Control de personal por geocercas"), "Control de personal por geocercas")}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 p-1 rounded-full bg-white/5 border border-white/10">
              <LangPill lng="es" current={lang} onClick={setLang} />
              <LangPill lng="en" current={lang} onClick={setLang} />
              <LangPill lng="fr" current={lang} onClick={setLang} />
            </div>

            <Link
              to="/login"
              className="px-4 py-2 rounded-2xl text-sm font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
            >
              {safeT(tt("landing.login", "Entrar"), "Entrar")}
            </Link>
          </div>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]">
              {safeT(
                tt("landing.heroTitle", "Controla a tu personal con geocercas inteligentes en cualquier parte del mundo"),
                "Controla a tu personal con geocercas inteligentes en cualquier parte del mundo"
              )}
            </h1>

            <p className="mt-5 text-white/70 text-base sm:text-lg leading-relaxed">
              {safeT(
                tt("landing.heroSubtitle", "App Geocercas te permite asignar personas a zonas, registrar actividades y calcular costos en tiempo real."),
                "App Geocercas te permite asignar personas a zonas, registrar actividades y calcular costos en tiempo real."
              )}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/login"
                className="px-5 py-2.5 rounded-2xl font-extrabold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
              >
                {safeT(tt("landing.goPanel", "Ir al panel de control"), "Ir al panel de control")}
              </Link>

              <Link
                to="/login?mode=magic"
                className="px-5 py-2.5 rounded-2xl font-bold bg-white/5 hover:bg-white/10 border border-white/10 transition
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
              >
                {safeT(tt("landing.magicEnter", "Entrar con link mágico"), "Entrar con link mágico")}
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-3xl bg-white/5 border border-white/10">
                <div className="text-sm font-bold">{safeT(tt("landing.feature1Title", "Geocercas"), "Geocercas")}</div>
                <div className="text-xs text-white/60 mt-1">
                  {safeT(tt("landing.feature1Desc", "Dibuja zonas y controla cumplimiento."), "Dibuja zonas y controla cumplimiento.")}
                </div>
              </div>
              <div className="p-4 rounded-3xl bg-white/5 border border-white/10">
                <div className="text-sm font-bold">{safeT(tt("landing.feature2Title", "Actividades"), "Actividades")}</div>
                <div className="text-xs text-white/60 mt-1">
                  {safeT(tt("landing.feature2Desc", "Registra tareas y costos por zona."), "Registra tareas y costos por zona.")}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-white/5 border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <h2 className="text-xl font-extrabold">{safeT(tt("landing.quickAccessTitle", "Acceso rápido"), "Acceso rápido")}</h2>

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
                className="w-full rounded-2xl bg-white/10 border border-white/10 px-4 py-2.5 text-white outline-none
                           focus:ring-2 focus:ring-emerald-500/70"
              />

              <button
                type="submit"
                disabled={loading}
                className="mt-4 w-full px-4 py-2.5 rounded-2xl font-extrabold bg-white text-slate-950 hover:bg-white/90 disabled:opacity-60 transition
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
              >
                {loading
                  ? safeT(tt("landing.sending", "Enviando..."), "Enviando...")
                  : safeT(tt("landing.sendMagic", "Enviar Magic Link"), "Enviar Magic Link")}
              </button>

              {statusMsg && <div className="mt-4 text-sm text-emerald-300">{statusMsg}</div>}
              {errorMsg && <div className="mt-4 text-sm text-red-300">{errorMsg}</div>}

              <p className="mt-4 text-xs text-white/50">
                {safeT(tt("landing.magicNote", "Importante: el acceso funciona solo con el Magic Link real."), "Importante: el acceso funciona solo con el Magic Link real.")}
              </p>

              <Link className="mt-2 inline-block text-xs text-white/70 underline" to="/help/support">
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
