import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

/** 🔐 Render seguro: NUNCA deja pasar objetos */
function safeText(v, fallback = "") {
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export default function Landing() {
  const { t } = useTranslation();
  const [hasSession, setHasSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    console.log("LANDING JSX VERSION ACTIVA");
  }, []);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      setCheckingSession(true);
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setHasSession(!!data?.session);
      } catch (e) {
        console.error("[Landing] getSession error:", e);
        if (!active) return;
        setHasSession(false);
      } finally {
        if (!active) return;
        setCheckingSession(false);
      }
    };
    checkSession();
    return () => {
      active = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("[Landing] signOut error:", e);
    } finally {
      setHasSession(false);
      navigate("/", { replace: true });
    }
  };

  const currentYear = new Date().getFullYear();
  const nextAfterLogin = "/inicio";

  const loginHref = useMemo(() => {
    const p = new URLSearchParams();
    p.set("next", nextAfterLogin);
    return `/login?${p.toString()}`;
  }, []);

  const magicHref = useMemo(() => {
    const p = new URLSearchParams();
    p.set("mode", "magic");
    p.set("next", nextAfterLogin);
    return `/login?${p.toString()}`;
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col">
      <header className="w-full border-b border-white/10 bg-slate-950/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-emerald-500/90 flex items-center justify-center">
              <span className="text-xs font-bold">AG</span>
            </div>
            <div>
              <div className="text-sm font-semibold">
                {safeText(t("landing.brandName"), "App Geocercas")}
              </div>
              <div className="text-[11px] text-slate-400">
                {safeText(t("landing.brandTagline"))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />

            {checkingSession ? (
              <span className="text-xs text-slate-400">Verificando…</span>
            ) : (
              <>
                {!hasSession && (
                  <Link to={loginHref} className="text-xs hover:text-white">
                    {safeText(t("landing.loginButton"), "Entrar")}
                  </Link>
                )}
                {hasSession && (
                  <>
                    <Link to="/inicio" className="text-xs text-emerald-300">
                      {safeText(t("landing.goToDashboard"), "Ir al panel")}
                    </Link>
                    <button onClick={handleLogout} className="text-xs border px-3 py-1 rounded-full">
                      {safeText(t("landing.logout"), "Salir")}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-semibold mb-4">
          {safeText(t("landing.heroTitlePrefix"), "Controla")}{" "}
          <span className="text-emerald-400">
            {safeText(t("landing.heroTitleHighlight"), "geocercas")}
          </span>{" "}
          {safeText(t("landing.heroTitleSuffix"))}
        </h1>

        <p className="text-slate-300 max-w-xl">
          {safeText(t("landing.heroSubtitle"))}
        </p>

        {!hasSession && !checkingSession && (
          <div className="mt-6 flex gap-3">
            <Link to={loginHref} className="bg-emerald-500 text-black px-4 py-2 rounded">
              {safeText(t("landing.ctaLogin"), "Entrar")}
            </Link>
            <Link to={magicHref} className="border px-4 py-2 rounded">
              {safeText(t("landing.ctaMagic"), "Enlace mágico")}
            </Link>
          </div>
        )}
      </main>

      <footer className="border-t border-white/10 bg-slate-950/80">
        <div className="max-w-6xl mx-auto px-4 py-4 text-[11px] text-slate-400 flex justify-between">
          <p>
            © {currentYear} {safeText(t("landing.brandName"), "App Geocercas")}
          </p>
          <a href="mailto:soporte@tugeocercas.com" className="hover:text-white">
            {safeText(t("landing.footerSupport"), "Soporte")}
          </a>
        </div>
      </footer>
    </div>
  );
}
