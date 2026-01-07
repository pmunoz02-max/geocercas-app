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

  // Debug (antes del return)
  useEffect(() => {
    console.log("LANDING JSX VERSION ACTIVA");
  }, []);

  // Detectar si ya hay sesión activa al cargar la Landing
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

  // IMPORTANTE:
  // Forzamos un "next" para que el flujo de login/magic termine en el panel (/inicio),
  // y no caiga en /tracker-gps por redirects por defecto.
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
      {/* Barra superior propia de la landing */}
      <header className="w-full border-b border-white/10 bg-slate-950/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-emerald-500/90 flex items-center justify-center shadow-lg shadow-emerald-500/40">
              <span className="text-xs font-bold tracking-tight">AG</span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight">
                {t("landing.brandName")}
              </span>
              <span className="text-[11px] text-slate-400">
                {t("landing.brandTagline")}
              </span>
            </div>
          </div>

          {/* Zona derecha: idioma SIEMPRE visible + acciones */}
          <div className="flex items-center gap-3">
            <LanguageSwitcher />

            {/* Mientras verifica sesión, evita parpadeos */}
            {checkingSession ? (
              <span className="text-xs text-slate-400">
                {t("landing.checkingSession") || "Verificando..."}
              </span>
            ) : (
              <>
                {!hasSession && (
                  <Link
                    to={loginHref}
                    className="text-xs md:text-sm text-slate-200 hover:text-white transition-colors"
                  >
                    {t("landing.loginButton") || "Entrar"}
                  </Link>
                )}

                {hasSession && (
                  <>
                    <Link
                      to="/inicio"
                      className="text-xs md:text-sm text-emerald-300 hover:text-emerald-100 transition-colors"
                    >
                      {t("landing.goToDashboard") || "Ir al panel"}
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="text-xs md:text-sm text-slate-300 hover:text-white transition-colors border border-slate-500/60 rounded-full px-3 py-1"
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

      {/* Contenido principal */}
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-10 md:py-16 grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          {/* Columna izquierda: Hero / texto */}
          <section className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-medium text-emerald-300">
                {t("landing.heroBadge") || "Plataforma operativa en tiempo real"}
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-white">
                {t("landing.heroTitlePrefix") || "Controla"}{" "}
                <span className="text-emerald-400">
                  {t("landing.heroTitleHighlight") || "geocercas"}
                </span>{" "}
                {t("landing.heroTitleSuffix") || "y asistencia con precisión"}
              </h1>
              <p className="text-sm md:text-base text-slate-300 max-w-xl">
                {t("landing.heroSubtitle") ||
                  "Gestiona personal, zonas, actividad y reportes. Diseñado para operaciones con múltiples organizaciones."}
              </p>
            </div>

            {/* Bloque de “acceso” */}
            {!hasSession && !checkingSession && (
              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-50">
                  {t("landing.accessTitle") || "Acceso con cuenta autorizada"}
                </p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {t("landing.accessBody") ||
                    "Esta aplicación requiere una cuenta invitada por un administrador. Si no tienes acceso, solicita una invitación a tu organización."}
                </p>
                <p className="text-[11px] text-slate-400">
                  {t("landing.accessHint") ||
                    "Consejo: usa “Enlace mágico” si tu administrador te invitó con correo."}
                </p>
              </div>
            )}

            {/* CTA principal */}
            {!checkingSession && (
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to={loginHref}
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition-colors"
                >
                  {t("landing.ctaLogin") || "Entrar a la plataforma"}
                </Link>

                <Link
                  to={magicHref}
                  className="inline-flex items-center justify-center rounded-xl border border-emerald-400/60 bg-slate-900/60 px-4 py-2.5 text-sm font-medium text-emerald-200 hover:bg-slate-800/80 transition-colors"
                >
                  {t("landing.ctaMagic") || "Enlace mágico (usuarios invitados)"}
                </Link>
              </div>
            )}

            {/* Nota discreta para revisión */}
            {!hasSession && !checkingSession && (
              <div className="text-[11px] text-slate-400">
                {t("landing.reviewNote") ||
                  "Nota: Si estás revisando la app (Google Play), utiliza las credenciales provistas en Play Console (App access)."}
              </div>
            )}

            {/* Bullets de valor */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs md:text-sm text-slate-300">
              <div className="rounded-lg border border-white/5 bg-slate-900/60 p-3 space-y-1">
                <div className="text-[11px] font-medium text-emerald-300">
                  {t("landing.bulletGeocercasTitle") || "Geocercas"}
                </div>
                <p className="text-[11px] md:text-xs text-slate-300">
                  {t("landing.bulletGeocercasBody") ||
                    "Zonas, alertas y control por ubicación."}
                </p>
              </div>
              <div className="rounded-lg border border-white/5 bg-slate-900/60 p-3 space-y-1">
                <div className="text-[11px] font-medium text-emerald-300">
                  {t("landing.bulletPersonalTitle") || "Personal"}
                </div>
                <p className="text-[11px] md:text-xs text-slate-300">
                  {t("landing.bulletPersonalBody") ||
                    "Asignaciones, actividades y seguimiento."}
                </p>
              </div>
              <div className="rounded-lg border border-white/5 bg-slate-900/60 p-3 space-y-1">
                <div className="text-[11px] font-medium text-emerald-300">
                  {t("landing.bulletCostsTitle") || "Reportes / Costos"}
                </div>
                <p className="text-[11px] md:text-xs text-slate-300">
                  {t("landing.bulletCostsBody") ||
                    "Tablas, métricas y control operativo."}
                </p>
              </div>
            </div>
          </section>

          {/* Columna derecha: mock de app */}
          <section className="relative">
            <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="absolute -bottom-6 -left-8 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl" />

            <div className="relative rounded-2xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/40 backdrop-blur-sm p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    {t("landing.livePanelLabel") || "Panel en vivo"}
                  </p>
                  <p className="text-sm font-medium text-slate-50">
                    {t("landing.livePanelTitle") || "Operación y monitoreo"}
                  </p>
                </div>
                <div className="flex -space-x-2">
                  <div className="h-6 w-6 rounded-full border border-slate-900 bg-emerald-500/90" />
                  <div className="h-6 w-6 rounded-full border border-slate-900 bg-emerald-300/90" />
                  <div className="h-6 w-6 rounded-full border border-slate-900 bg-slate-500/90" />
                </div>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-slate-950/70 p-3 space-y-3">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span>{t("landing.zonesActive") || "Zonas activas"}</span>
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {t("landing.statusOnline") || "Online"}
                  </span>
                </div>
                <div className="relative h-40 rounded-lg bg-[radial-gradient(circle_at_top,_#22c55e33,_transparent_55%),radial-gradient(circle_at_bottom,_#0ea5e933,_transparent_55%),linear-gradient(135deg,_#020617,_#020617)] overflow-hidden">
                  <div className="absolute inset-4 border border-emerald-500/30 rounded-xl" />
                  <div className="absolute left-4 top-6 h-10 w-16 border border-emerald-400/60 rounded-md" />
                  <div className="absolute right-6 bottom-5 h-12 w-20 border border-emerald-500/40 rounded-lg" />
                  <div className="absolute left-10 top-10 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.8)]" />
                  <div className="absolute left-16 top-20 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_2px_rgba(52,211,153,0.7)]" />
                  <div className="absolute right-10 bottom-10 h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_10px_2px_rgba(56,189,248,0.7)]" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-200">
                <div className="rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 space-y-0.5">
                  <p className="font-medium">
                    {t("landing.assistanceControlTitle") ||
                      "Control de asistencia"}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {t("landing.assistanceControlBody") ||
                      "Eventos por zona y actividad."}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 space-y-0.5">
                  <p className="font-medium">
                    {t("landing.multiOrgTitle") || "Multi-organización"}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {t("landing.multiOrgBody") ||
                      "Aislamiento por empresa y roles."}
                  </p>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 pt-1">
                {t("landing.privacyMiniNote") ||
                  "Privacidad: la ubicación se usa solo para funciones de geocerca y seguimiento según permisos otorgados por el usuario."}
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-slate-950/80">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400">
          <p>
            © {currentYear} {t("landing.brandName")}.{" "}
            {t("landing.rightsReserved") || "Todos los derechos reservados."}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a href="#faq" className="hover:text-slate-200 transition-colors">
              {t("landing.footerFaq") || "FAQ"}
            </a>
            <a
              href="mailto:soporte@tugeocercas.com"
              className="hover:text-slate-200 transition-colors"
            >
              {t("landing.footerSupport") || "Soporte"}
            </a>
            <a
              href="#terminos"
              className="hover:text-slate-200 transition-colors"
            >
              {t("landing.footerTerms") || "Términos"}
            </a>
            <a
              href="#privacidad"
              className="hover:text-slate-200 transition-colors"
            >
              {t("landing.footerPrivacy") || "Privacidad"}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
