// src/pages/Landing.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useAuth } from "../context/AuthContext";
import { formatPlanPrice } from "../config/pricing";

const FALLBACKS = {
  "app.brand": {
    es: "App Geocercas",
    en: "App Geofences",
    fr: "App Géorepères",
  },
  "app.header.login": {
    es: "Iniciar sesión",
    en: "Sign in",
    fr: "Se connecter",
  },
  "landing.goDashboard": {
    es: "Ir al panel",
    en: "Go to dashboard",
    fr: "Aller au tableau",
  },
  "landing.pricing": {
    es: "Precios",
    en: "Pricing",
    fr: "Tarifs",
  },
  "landing.footerPrivacy": {
    es: "Privacidad",
    en: "Privacy",
    fr: "Confidentialité",
  },
  "landing.footerTerms": {
    es: "Términos",
    en: "Terms",
    fr: "Conditions",
  },
  "landing.heroBadge": {
    es: "Plataforma SaaS para control GPS y geocercas",
    en: "SaaS platform for GPS control and geofences",
    fr: "Plateforme SaaS pour le contrôle GPS et les géorepères",
  },
  "landing.heroTitle": {
    es: "Convierte posiciones GPS en control operativo",
    en: "Turn GPS positions into operational control",
    fr: "Transformez les positions GPS en contrôle opérationnel",
  },
  "landing.heroSubtitle": {
    es: "App Geocercas ayuda a empresas a supervisar trackers, validar presencia en zonas definidas y consultar reportes operativos desde una plataforma web segura.",
    en: "App Geofences helps companies supervise trackers, validate presence in defined zones, and review operational reports from a secure web platform.",
    fr: "App Géorepères aide les entreprises à superviser les trackers, valider la présence dans des zones définies et consulter des rapports opérationnels depuis une plateforme web sécurisée.",
  },
  "landing.ctaStart": {
    es: "Empezar ahora",
    en: "Get started",
    fr: "Commencer",
  },
  "landing.panelTitle": {
    es: "Panel operativo",
    en: "Operations panel",
    fr: "Panneau opérationnel",
  },
  "landing.demoBadge": {
    es: "Monitoreo GPS con geocercas en tiempo real",
    en: "Real-time GPS monitoring with geofences",
    fr: "Suivi GPS en temps réel avec géorepères",
  },
  "landing.demoTitle": {
    es: "Visualiza personal, rutas y eventos dentro de tus geocercas.",
    en: "Visualize staff, routes, and events inside your geofences.",
    fr: "Visualisez le personnel, les itinéraires et les événements dans vos géorepères.",
  },
  "landing.demoSubtitle": {
    es: "App Geocercas convierte posiciones GPS en una vista operativa clara para tu equipo.",
    en: "App Geofences turns GPS positions into a clear operational view for your team.",
    fr: "App Géorepères transforme les positions GPS en une vue opérationnelle claire pour votre équipe.",
  },
  "landing.demoMapLabel": {
    es: "Mapa en vivo",
    en: "Live map",
    fr: "Carte en direct",
  },
  "landing.demoEventsLabel": {
    es: "Eventos",
    en: "Events",
    fr: "Événements",
  },
  "landing.demoReportsLabel": {
    es: "Reportes",
    en: "Reports",
    fr: "Rapports",
  },
  "landing.featureGeofencesTitle": {
    es: "Geocercas operativas",
    en: "Operational geofences",
    fr: "Géorepères opérationnels",
  },
  "landing.featureGeofencesBody": {
    es: "Define zonas de trabajo y valida entradas, salidas y permanencia del personal en campo.",
    en: "Define work zones and validate entries, exits, and field staff presence.",
    fr: "Définissez des zones de travail et validez les entrées, sorties et la présence du personnel sur le terrain.",
  },
  "landing.featureTrackingTitle": {
    es: "Tracking GPS",
    en: "GPS tracking",
    fr: "Suivi GPS",
  },
  "landing.featureTrackingBody": {
    es: "Consulta posiciones recientes de trackers autorizados para mejorar la supervisión diaria.",
    en: "Check recent positions from authorized trackers to improve daily supervision.",
    fr: "Consultez les positions récentes des trackers autorisés pour améliorer la supervision quotidienne.",
  },
  "landing.featureReportsTitle": {
    es: "Reportes de operación",
    en: "Operations reports",
    fr: "Rapports opérationnels",
  },
  "landing.featureReportsBody": {
    es: "Convierte movimientos GPS en información útil para control, auditoría y gestión.",
    en: "Turn GPS movements into useful information for control, auditing, and management.",
    fr: "Transformez les mouvements GPS en informations utiles pour le contrôle, l’audit et la gestion.",
  },
  "landing.featureAccessTitle": {
    es: "Acceso empresarial",
    en: "Business access",
    fr: "Accès entreprise",
  },
  "landing.featureAccessBody": {
    es: "Gestiona usuarios, trackers y organizaciones desde una plataforma web segura.",
    en: "Manage users, trackers, and organizations from a secure web platform.",
    fr: "Gérez les utilisateurs, les trackers et les organisations depuis une plateforme web sécurisée.",
  },
  "landing.pricingTitle": {
    es: "Precios",
    en: "Pricing",
    fr: "Tarifs",
  },
  "landing.pricingSubtitle": {
    es: "Planes simples para empezar y escalar según el tamaño de tu operación.",
    en: "Simple plans to start and scale according to the size of your operation.",
    fr: "Des forfaits simples pour démarrer et évoluer selon la taille de votre opération.",
  },
  "landing.planBasicTitle": {
    es: "Básico",
    en: "Basic",
    fr: "Basique",
  },
  "landing.planBasicDesc": {
    es: "Para pruebas y equipos pequeños.",
    en: "For tests and small teams.",
    fr: "Pour les tests et les petites équipes.",
  },
  "landing.planBasicPrice": {
    es: "Gratis",
    en: "Free",
    fr: "Gratuit",
  },
  "landing.planBasicDetail": {
    es: "Hasta 3 trackers.",
    en: "Up to 3 trackers.",
    fr: "Jusqu’à 3 trackers.",
  },
  "landing.planProTitle": {
    es: "Pro",
    en: "Pro",
    fr: "Pro",
  },
  "landing.planProDesc": {
    es: "Para organizaciones en operación.",
    en: "For active organizations.",
    fr: "Pour les organisations en activité.",
  },
  "landing.planProDetail": {
    es: "Hasta 50 trackers por organización.",
    en: "Up to 50 trackers per organization.",
    fr: "Jusqu’à 50 trackers par organisation.",
  },
  "landing.planEnterpriseTitle": {
    es: "Empresas",
    en: "Enterprise",
    fr: "Entreprise",
  },
  "landing.planEnterpriseDesc": {
    es: "Para operaciones grandes.",
    en: "For large operations.",
    fr: "Pour les grandes opérations.",
  },
  "landing.planEnterpriseDetail": {
    es: "Más de 50 trackers y soporte comercial.",
    en: "More than 50 trackers and commercial support.",
    fr: "Plus de 50 trackers et support commercial.",
  },
  "landing.finalCtaTitle": {
    es: "Convierte posiciones GPS en control operativo",
    en: "Turn GPS positions into operational control",
    fr: "Transformez les positions GPS en contrôle opérationnel",
  },
  "landing.finalCtaSubtitle": {
    es: "Para soporte, ventas o revisión de cuenta, contáctanos por correo.",
    en: "For support, sales, or account review, contact us by email.",
    fr: "Pour le support, les ventes ou la révision de compte, contactez-nous par e-mail.",
  },
  "landing.footerCopyright": {
    es: "Todos los derechos reservados.",
    en: "All rights reserved.",
    fr: "Tous droits réservés.",
  },
};

export default function Landing() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState(null);
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const currentLang = String(i18n.resolvedLanguage || i18n.language || "es")
    .toLowerCase()
    .slice(0, 2);

  const tr = (key) => {
    const fallback = FALLBACKS[key]?.[currentLang] || FALLBACKS[key]?.es || key;
    return t(key, { defaultValue: fallback });
  };

  const plans = [
    {
      name: tr("landing.planBasicTitle"),
      description: tr("landing.planBasicDesc"),
      price: tr("landing.planBasicPrice"),
      detail: tr("landing.planBasicDetail"),
    },
    {
      name: tr("landing.planProTitle"),
      description: tr("landing.planProDesc"),
      price: formatPlanPrice("pro", currentLang),
      detail: tr("landing.planProDetail"),
      featured: true,
    },
    {
      name: tr("landing.planEnterpriseTitle"),
      description: tr("landing.planEnterpriseDesc"),
      price: formatPlanPrice("enterprise", currentLang),
      detail: tr("landing.planEnterpriseDetail"),
    },
  ];

  const features = [
    {
      title: tr("landing.featureGeofencesTitle"),
      body: tr("landing.featureGeofencesBody"),
    },
    {
      title: tr("landing.featureTrackingTitle"),
      body: tr("landing.featureTrackingBody"),
    },
    {
      title: tr("landing.featureReportsTitle"),
      body: tr("landing.featureReportsBody"),
    },
    {
      title: tr("landing.featureAccessTitle"),
      body: tr("landing.featureAccessBody"),
    },
  ];

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      if (data?.session?.access_token) {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setLoginError(err.message || "Error de autenticación");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link to="/" className="text-lg font-bold tracking-tight text-white">
            {tr("app.brand")}
          </Link>

          <nav className="flex items-center gap-3 text-sm">
            <a href="#precios" className="hidden text-slate-300 hover:text-white sm:inline">
              {tr("landing.pricing")}
            </a>
            <Link to="/privacy" className="hidden text-slate-300 hover:text-white sm:inline">
              {tr("landing.footerPrivacy")}
            </Link>
            <Link to="/terms" className="hidden text-slate-300 hover:text-white sm:inline">
              {tr("landing.footerTerms")}
            </Link>
            <div className="relative z-50">
              <LanguageSwitcher />
            </div>
            <a
              href={user ? "/dashboard" : "/auth"}
              className="rounded-2xl bg-sky-500 px-4 py-2 font-semibold text-white hover:bg-sky-400 transition shadow-lg shadow-sky-900/30"
            >
              {user ? tr("landing.goDashboard") : tr("app.header.login")}
            </a>
          </nav>
        </div>
      </header>

      <main>
        <form onSubmit={handleLogin} style={{ maxWidth: 320, margin: "32px auto" }}>
          <h2>Iniciar sesión</h2>
          <div style={{ marginBottom: 8 }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ width: "100%", padding: 8 }}
              required
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: "100%", padding: 8 }}
              required
            />
          </div>
          <button type="submit" style={{ width: "100%", padding: 10, background: "#0ea5e9", color: "white", border: 0, borderRadius: 6 }}>
            Ingresar
          </button>
          {loginError && <div style={{ color: "red", marginTop: 8 }}>{loginError}</div>}
        </form>
        <section className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold tracking-wide text-sky-300">
              {tr("landing.heroBadge")}
            </p>

            <h1 className="mt-6 max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              {tr("landing.heroTitle")}
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              {tr("landing.heroSubtitle")}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={user ? "/dashboard" : "/auth"}
                className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/30 transition hover:bg-sky-400"
              >
                {user ? tr("landing.goDashboard") : tr("landing.ctaStart")}
              </a>
              <a
                href="#precios"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-900"
              >
                {tr("landing.ctaPricing")}
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-4 shadow-2xl overflow-hidden">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
              <p className="text-sm font-semibold text-sky-300 mb-3">
                {tr("landing.panelTitle")}
              </p>

              <div className="relative w-full overflow-hidden rounded-2xl border border-slate-800 bg-white text-slate-950">
                <div className="m-4 rounded-[2rem] bg-sky-50 p-6 sm:p-8">
                  <p className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700">
                    <span className="h-3 w-3 rounded-full bg-sky-500" />
                    {tr("landing.demoBadge")}
                  </p>

                  <h3 className="mt-7 max-w-xl text-3xl font-bold leading-tight text-slate-950 sm:text-4xl">
                    {tr("landing.demoTitle")}
                  </h3>

                  <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
                    {tr("landing.demoSubtitle")}
                  </p>

                  <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {tr("landing.demoMapLabel")}
                      </p>
                      <div className="mt-3 h-16 rounded-xl bg-sky-100" />
                    </div>
                    <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {tr("landing.demoEventsLabel")}
                      </p>
                      <div className="mt-3 space-y-2">
                        <div className="h-2 rounded-full bg-sky-200" />
                        <div className="h-2 w-2/3 rounded-full bg-sky-100" />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {tr("landing.demoReportsLabel")}
                      </p>
                      <div className="mt-3 flex items-end gap-2">
                        <div className="h-8 w-4 rounded bg-sky-200" />
                        <div className="h-12 w-4 rounded bg-sky-300" />
                        <div className="h-6 w-4 rounded bg-sky-100" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-10">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="mb-3 h-2.5 w-2.5 rounded-full bg-sky-400" />
                <h3 className="text-base font-semibold text-slate-100">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="precios" className="mx-auto max-w-7xl px-6 py-16">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-white">{tr("landing.pricingTitle")}</h2>
            <p className="mt-4 text-base text-slate-300">{tr("landing.pricingSubtitle")}</p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={
                  plan.featured
                    ? "rounded-3xl border border-sky-500 bg-sky-950/40 p-7 shadow-2xl"
                    : "rounded-3xl border border-slate-800 bg-slate-900/60 p-7"
                }
              >
                <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
                <p className="mt-4 text-sm text-slate-300">{plan.description}</p>
                <p className="mt-7 text-3xl font-bold text-white">{plan.price}</p>
                <p className="mt-4 text-sm text-slate-400">{plan.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-slate-800 bg-slate-900/40 px-6 py-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white">{tr("landing.finalCtaTitle")}</h2>
          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300">{tr("landing.finalCtaSubtitle")}</p>
          <a
            href="mailto:soporte@tugeocercas.com"
            className="mt-8 inline-flex rounded-2xl bg-white px-8 py-4 font-semibold text-slate-950 hover:bg-slate-200"
          >
            soporte@tugeocercas.com
          </a>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {tr("app.brand")}. {tr("landing.footerCopyright")}
        </p>
        <div className="flex flex-wrap gap-4">
          <Link to="/privacy" className="hover:text-sky-300">
            {tr("landing.footerPrivacy")}
          </Link>
          <Link to="/terms" className="hover:text-sky-300">
            {tr("landing.footerTerms")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
