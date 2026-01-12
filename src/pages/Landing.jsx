// src/pages/Landing.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";

/** =========================
 * Helpers seguros i18n
 * ========================= */
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

export default function Landing() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // ⚠️ Landing NO depende de AuthContext
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
      setErrorMsg(
        safeT(t("landing.invalidEmail"), "Correo inválido.")
      );
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

      setStatusMsg(
        safeT(
          t("landing.magicLinkSent"),
          "Te enviamos un enlace de acceso. Revisa tu correo."
        )
      );
    } catch (err) {
      console.error("[Landing] magic link error", err);
      setErrorMsg(
        safeT(t("landing.magicLinkError"), "No se pudo enviar el enlace.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="w-full border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center font-bold">
              AG
            </div>
            <div>
              <div className="font-semibold">
                {safeT(t("landing.brandName"), "App Geocercas")}
              </div>
              <div className="text-xs text-white/60">
                {safeT(
                  t("landing.brandTagline"),
                  "Control de personal por geocercas"
                )}
              </div>
            </div>
          </div>

          <Link
            to="/login"
            className="px-3 py-1.5 rounded-full text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10 transition"
          >
            {safeT(t("landing.login"), "Entrar")}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
              {safeT(
                t("landing.heroTitle"),
                "Controla a tu personal con geocercas inteligentes en cualquier parte del mundo"
              )}
            </h1>

            <p className="mt-5 text-white/70 text-lg">
              {safeT(
                t("landing.heroSubtitle"),
                "Asigna personas, registra actividades y calcula costos en tiempo real."
              )}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/login"
                className="px-5 py-2.5 rounded-full font-semibold bg-emerald-600 hover:bg-emerald-500 transition"
              >
                Ir al panel de control
              </Link>

              <Link
                to="/login?mode=magic"
                className="px-5 py-2.5 rounded-full font-semibold bg-white/10 hover:bg-white/15 border border-white/10 transition"
              >
                Entrar con link mágico
              </Link>
            </div>
          </div>

          {/* Magic Link rápido */}
          <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
            <h2 className="text-xl font-bold">
              {safeT(t("landing.quickAccessTitle"), "Acceso rápido")}
            </h2>

            <p className="mt-2 text-sm text-white/70">
              {safeT(
                t("landing.quickAccessDesc"),
                "Ingresa con Magic Link (sin contraseña)."
              )}
            </p>

            <form onSubmit={handleSendMagicLink} className="mt-6">
              <label className="block text-xs text-white/70 mb-2">
                Correo
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
                {loading ? "Enviando..." : "Enviar Magic Link"}
              </button>

              {statusMsg && (
                <div className="mt-4 text-sm text-emerald-300">
                  {statusMsg}
                </div>
              )}
              {errorMsg && (
                <div className="mt-4 text-sm text-red-300">
                  {errorMsg}
                </div>
              )}
            </form>
          </div>
        </div>

        <footer className="mt-14 pt-6 border-t border-white/10 text-xs text-white/50 flex justify-between">
          <span>© {new Date().getFullYear()} App Geocercas</span>
          <span>Fenice Ecuador S.A.S.</span>
        </footer>
      </main>
    </div>
  );
}
