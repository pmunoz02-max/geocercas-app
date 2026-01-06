// src/pages/Landing.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function Landing() {
  const { t } = useTranslation();
  const [hasSession, setHasSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();

  // Debug
  useEffect(() => {
    console.log("LANDING JSX VERSION ACTIVA");
  }, []);

  // Detectar sesión activa
  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      setCheckingSession(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;
        setHasSession(!!session);
      } catch (e) {
        console.error("[Landing] error getSession:", e);
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
      console.error("[Landing] error signOut:", e);
    } finally {
      setHasSession(false);
      navigate("/", { replace: true });
    }
  };

  const currentYear = new Date().getFullYear();

  // Forzar destino post-login
  const nextAfterLogin = "/inicio";

  const loginHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("next", nextAfterLogin);
    return `/login?${params.toString()}`;
  }, []);

  const magicHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("mode", "magic");
    params.set("next", nextAfterLogin);
    return `/login?${params.toString()}`;
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="w-full border-b border-white/10 bg-slate-950/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-emerald-500/90 flex items-center justify-center shadow-lg shadow-emerald-500/40">
              <span className="text-xs font-bold">AG</span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold">
                {t("landing.brandName")}
              </span>
              <span className="text-[11px] text-slate-400">
                {t("landing.brandTagline")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />

            {checkingSession ? (
              <span className="text-xs text-slate-400">
                {t("landing.checkingSession") || "Verificando..."}
              </span>
            ) : (
              <>
                {!hasSession && (
                  <Link
                    to={loginHref}
                    className="text-xs md:text-sm text-slate-200 hover:text-white"
                  >
                    {t("landing.loginButton") || "Entrar"}
                  </Link>
                )}

                {hasSession && (
                  <>
                    <Link
                      to="/inicio"
                      className="text-xs md:text-sm text-emerald-300 hover:text-emerald-100"
                    >
                      {t("landing.goToDashboard") || "Ir al panel"}
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="text-xs md:text-sm border border-slate-500/60 rounded-full px-3 py-1"
                    >
                      {t("landing.logout") || "Salir"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-10 md:py-16 grid md:grid-cols-2 gap-12 items-center">
          <section className="space-y-6">
            <h1 className="text-3xl md:text-4xl font-semibold">
              {t("landing.heroTitle") ||
                "Control operativo con geocercas inteligentes"}
            </h1>

            <p className="text-slate-300 max-w-xl">
              {t("landing.heroSubtitle") ||
                "Gestión de personal, zonas, asistencia y reportes en una sola plataforma."}
            </p>

            {!checkingSession && (
              <div className="flex gap-3 flex-wrap">
                <Link
                  to={loginHref}
                  className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950"
                >
                  {t("landing.ctaLogin") || "Entrar"}
                </Link>

                <Link
                  to={magicHref}
                  className="rounded-xl border border-emerald-400/60 px-4 py-2.5 text-sm text-emerald-200"
                >
                  {t("landing.ctaMagic") || "Enlace mágico"}
                </Link>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm text-slate-300">
              {t("landing.panelPreview") ||
                "Panel en vivo con zonas activas, asistencia y control multi-organización."}
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-slate-950/80">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400">
          <p>
            © {currentYear} {t("landing.brandName")}.{" "}
            {t("landing.rightsReserved") || "Todos los derechos reservados."}
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <a href="#faq" className="hover:text-slate-200">
              {t("landing.footerFaq") || "FAQ"}
            </a>

            <a
              href="mailto:soporte@tugeocercas.com"
              className="hover:text-slate-200"
            >
              {t("landing.footerSupport") || "Soporte"}
            </a>

            <a href="#terminos" className="hover:text-slate-200">
              {t("landing.footerTerms") || "Términos"}
            </a>

            <a href="#privacidad" className="hover:text-slate-200">
              {t("landing.footerPrivacy") || "Privacidad"}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
