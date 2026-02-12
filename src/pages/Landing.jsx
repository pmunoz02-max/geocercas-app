// src/pages/Landing.jsx
<<<<<<< HEAD
import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
=======
import React, { useMemo, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
>>>>>>> preview
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import LanguageSwitcher from "../components/LanguageSwitcher";

<<<<<<< HEAD
=======
/**
 * Landing UNIVERSAL:
 * - Público: NO consulta sesión, NO usa useAuth, NO hace getSession.
 * - Anti-spam OTP: cooldown + lock persistente por email (localStorage)
 * - ✅ PKCE catcher: si cae /?code=... lo envía a /auth/callback?code=...
 */

>>>>>>> preview
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

<<<<<<< HEAD
function safeNext(raw) {
  const n = String(raw || "").trim();
  if (!n || !n.startsWith("/")) return "/inicio";
  return n;
=======
const LS_LOCK_PREFIX = "tg_otp_lock_v1:"; // lock por email
const nowSec = () => Math.floor(Date.now() / 1000);

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}
function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function getEmailLockSeconds(email) {
  try {
    const key = LS_LOCK_PREFIX + normEmail(email);
    const until = parseInt(localStorage.getItem(key) || "0", 10);
    const left = until - nowSec();
    return Number.isFinite(left) ? Math.max(0, left) : 0;
  } catch {
    return 0;
  }
}

function setEmailLockSeconds(email, seconds) {
  try {
    const key = LS_LOCK_PREFIX + normEmail(email);
    const until = nowSec() + Math.max(0, seconds);
    localStorage.setItem(key, String(until));
  } catch {
    // ignore
  }
>>>>>>> preview
}

export default function Landing() {
  const { t } = useTranslation();
<<<<<<< HEAD
  const location = useLocation();
=======
  const [searchParams] = useSearchParams();

  // ✅ PKCE catcher: si Supabase manda al Site URL con ?code=..., reenviar a /auth/callback
  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) return;

    const next = searchParams.get("next") || "/inicio";
    const out = new URLSearchParams(searchParams);
    out.set("next", next);

    // evita loops: si por alguna razón ya estuviéramos en callback, no hacer nada
    // (aunque Landing no se monta en /auth/callback, igual lo dejamos blindado)
    const target = `/auth/callback?${out.toString()}`;
    window.location.replace(target);
  }, [searchParams]);
>>>>>>> preview

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

  // Cooldown de UI (segundos)
  const [cooldownSec, setCooldownSec] = useState(0);

  // Cuando cambia el email, cargar lock persistente
  useEffect(() => {
    const em = normEmail(email);
    if (!em) return;
    const locked = getEmailLockSeconds(em);
    if (locked > 0) setCooldownSec((s) => Math.max(s, locked));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  // Tick de cooldown
  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = setInterval(() => {
      setCooldownSec((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownSec]);

  const handleSendMagicLink = async (e) => {
    e.preventDefault();
    setStatusMsg("");
    setErrorMsg("");

    const em = normEmail(email);

    // Reglas anti-spam
    const locked = em ? getEmailLockSeconds(em) : 0;
    const effectiveCooldown = Math.max(cooldownSec, locked);

    if (effectiveCooldown > 0) {
      setCooldownSec(effectiveCooldown);
      setErrorMsg(tt("landing.cooldown", `Espera ${effectiveCooldown}s antes de volver a intentar.`));
      return;
    }

    if (!em || !isValidEmail(em)) {
      setErrorMsg(tt("login.errors.invalidEmail", "Correo inválido."));
      return;
    }

    setLoading(true);
    try {
<<<<<<< HEAD
      const sp = new URLSearchParams(location.search || "");
      const next = safeNext(sp.get("next") || "/inicio");

      // ✅ Mantener next en el callback
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
=======
      // ✅ usa SIEMPRE el alias estable (evita deploy URLs viejos)
      const redirectTo = `https://geocercas-app-v3-preview.vercel.app/auth/callback`;
>>>>>>> preview

      const { error } = await supabase.auth.signInWithOtp({
        email: em,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;

<<<<<<< HEAD
      // en fr.json existe login.magicLinkSent (también landing tiene accessHint, etc.)
      setStatusMsg(tt("login.magicLinkSent", "Te enviamos un enlace de acceso. Revisa tu correo."));
    } catch (err) {
      console.error("[Landing] signInWithOtp error", err);
      setErrorMsg(tt("login.errors.unknown", "No se pudo enviar el enlace. Intenta nuevamente."));
=======
      setStatusMsg(tt("landing.magicLinkSent", "Te enviamos un enlace de acceso. Revisa tu correo."));

      setCooldownSec(75);
      setEmailLockSeconds(em, 75);
    } catch (err) {
      console.error("[Landing] signInWithOtp error", err);

      const msg = String(err?.message || "").toLowerCase();
      const isRate =
        err?.status === 429 ||
        msg.includes("rate limit") ||
        msg.includes("too many") ||
        msg.includes("exceeded") ||
        msg.includes("over_email_send_rate_limit");

      if (isRate) {
        setCooldownSec(120);
        setEmailLockSeconds(em, 120);
        setErrorMsg(
          tt(
            "landing.rateLimit",
            "Límite de envíos alcanzado. Espera 1–2 minutos y vuelve a intentar (o usa otro correo)."
          )
        );
      } else {
        setErrorMsg(tt("landing.magicLinkError", "No se pudo enviar el enlace. Intenta nuevamente."));
      }
>>>>>>> preview
    } finally {
      setLoading(false);
    }
  };

<<<<<<< HEAD
  // Construcción del título con tus keys reales
  const heroTitle = `${tt("landing.heroTitlePrefix", "Controla a tu personal")} ${tt(
    "landing.heroTitleHighlight",
    "con geocercas inteligentes"
  )} ${tt("landing.heroTitleSuffix", "en cualquier parte del mundo")}`;
=======
  const btnDisabled = loading || cooldownSec > 0;
>>>>>>> preview

  return (
    <div className="min-h-screen bg-slate-950 text-white">
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
              <div className="font-semibold">
                {safeT(tt("landing.brandName", "App Geocercas"), "App Geocercas")}
              </div>
              <div className="text-xs text-white/60">
                {safeT(
                  tt("landing.brandTagline", "Control de personal por geocercas"),
                  "Control de personal por geocercas"
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              to="/login"
              className="px-4 py-2 rounded-2xl text-sm font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
            >
              {safeT(tt("landing.loginButton", "Entrar"), "Entrar")}
            </Link>
          </div>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/70">
              {safeT(tt("landing.heroBadge", "Control inteligente del terreno"), "Control inteligente del terreno")}
            </div>

            <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]">
              {heroTitle}
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
                className="px-5 py-2.5 rounded-2xl font-extrabold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
              >
                {safeT(tt("landing.ctaLogin", "Ir al panel de control"), "Ir al panel de control")}
              </Link>

              <Link
                to="/login?mode=magic"
                className="px-5 py-2.5 rounded-2xl font-bold bg-white/5 hover:bg-white/10 border border-white/10 transition
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
              >
                {safeT(tt("landing.ctaMagic", "Entrar con link mágico"), "Entrar con link mágico")}
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-3xl bg-white/5 border border-white/10">
                <div className="text-sm font-bold">{safeT(tt("landing.bulletGeocercasTitle", "Geocercas"), "Geocercas")}</div>
                <div className="text-xs text-white/60 mt-1">{safeT(tt("landing.bulletGeocercasBody", "Crea y gestiona geocercas."), "Crea y gestiona geocercas.")}</div>
              </div>
              <div className="p-4 rounded-3xl bg-white/5 border border-white/10">
                <div className="text-sm font-bold">{safeT(tt("landing.bulletPersonalTitle", "Personal"), "Personal")}</div>
                <div className="text-xs text-white/60 mt-1">{safeT(tt("landing.bulletPersonalBody", "Registra y asigna personal."), "Registra y asigna personal.")}</div>
              </div>
              <div className="p-4 rounded-3xl bg-white/5 border border-white/10">
                <div className="text-sm font-bold">{safeT(tt("landing.bulletCostsTitle", "Costos"), "Costos")}</div>
                <div className="text-xs text-white/60 mt-1">{safeT(tt("landing.bulletCostsBody", "Dashboards de costos."), "Dashboards de costos.")}</div>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-white/5 border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <h2 className="text-xl font-extrabold">
              {safeT(tt("landing.livePanelTitle", "Acceso rápido"), "Acceso rápido")}
            </h2>

            <p className="mt-2 text-sm text-white/70">
              {safeT(
                tt("landing.quickAccessDesc", "Si prefieres, puedes ingresar con Magic Link (sin contraseña)."),
                "Si prefieres, puedes ingresar con Magic Link (sin contraseña)."
              )}
            </p>

            <form onSubmit={handleSendMagicLink} className="mt-6">
<<<<<<< HEAD
              <label className="block text-xs text-white/70 mb-2">
                {safeT(tt("login.emailLabel", "Correo"), "Correo")}
              </label>
=======
              <label className="block text-xs text-white/70 mb-2">{safeT(tt("landing.email", "Correo"), "Correo")}</label>
>>>>>>> preview

              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder={tt("login.emailPlaceholder", "correo@ejemplo.com")}
                className="w-full rounded-2xl bg-white/10 border border-white/10 px-4 py-2.5 text-white outline-none
                           focus:ring-2 focus:ring-emerald-500/70"
              />

              <button
                type="submit"
<<<<<<< HEAD
                disabled={loading}
                className="mt-4 w-full px-4 py-2.5 rounded-2xl font-extrabold bg-white text-slate-950 hover:bg-white/90 disabled:opacity-60 transition
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
              >
                {loading ? tt("login.magicSubmitting", "Enviando…") : tt("login.magicButton", "Enviar Magic Link")}
=======
                disabled={btnDisabled}
                className="mt-4 w-full px-4 py-2.5 rounded-xl font-semibold bg-white text-slate-900 hover:bg-white/90 disabled:opacity-60 transition"
              >
                {loading
                  ? safeT(tt("landing.sending", "Enviando..."), "Enviando...")
                  : cooldownSec > 0
                  ? `Espera ${cooldownSec}s`
                  : safeT(tt("landing.sendMagic", "Enviar Magic Link"), "Enviar Magic Link")}
>>>>>>> preview
              </button>

              {statusMsg && <div className="mt-4 text-sm text-emerald-300">{statusMsg}</div>}
              {errorMsg && <div className="mt-4 text-sm text-red-300">{errorMsg}</div>}

              <p className="mt-4 text-xs text-white/50">
<<<<<<< HEAD
                {safeT(tt("landing.privacyMiniNote", "Privacidad: la localización se usa solo para funciones de geocerca/tracking."), "")}
=======
                {safeT(
                  tt("landing.magicNote", "Importante: el acceso funciona solo con el Magic Link real."),
                  "Importante: el acceso funciona solo con el Magic Link real."
                )}
>>>>>>> preview
              </p>

              <Link className="mt-2 inline-block text-xs text-white/70 underline" to="/help/support">
                {safeT(tt("landing.footerSupport", "Soporte"), "Soporte")}
              </Link>
            </form>
          </div>
        </div>

        <footer className="mt-14 pt-6 border-t border-white/10 text-xs text-white/50 flex items-center justify-between">
          <span>
<<<<<<< HEAD
            © {new Date().getFullYear()} {safeT(tt("landing.brandName", "App Geocercas"), "App Geocercas")} —{" "}
            {safeT(tt("landing.rightsReserved", "Todos los derechos reservados"), "")}
=======
            © {new Date().getFullYear()} {safeT(tt("landing.brandName", "App Geocercas"), "App Geocercas")}
>>>>>>> preview
          </span>
          <span>Fenice Ecuador S.A.S.</span>
        </footer>
      </main>
    </div>
  );
}
