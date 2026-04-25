// src/pages/Landing.jsx
import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

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
  "landing.ctaPricing": {
    es: "Ver precios",
    en: "View pricing",
    fr: "Voir les tarifs",
  },
  "landing.panelTitle": {
    es: "Panel operativo",
    en: "Operations panel",
    fr: "Panneau opérationnel",
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
  "landing.planProPrice": {
    es: "USD 29/mes",
    en: "USD 29/month",
    fr: "29 USD/mois",
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
  "landing.planEnterprisePrice": {
    es: "USD 99/mes",
    en: "USD 99/month",
    fr: "99 USD/mois",
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
  const { t, i18n } = useTranslation();
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
      price: tr("landing.planProPrice"),
      detail: tr("landing.planProDetail"),
      featured: true,
    },
    {
      name: tr("landing.planEnterpriseTitle"),
      description: tr("landing.planEnterpriseDesc"),
      price: tr("landing.planEnterprisePrice"),
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
            <Link
              to="/auth"
              className="rounded-2xl bg-white px-4 py-2 font-semibold text-slate-950 hover:bg-slate-200"
            >
              {tr("app.header.login")}
            </Link>
          </nav>
        </div>
      </header>

      <main>
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
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/30 transition hover:bg-sky-400"
              >
                {tr("landing.ctaStart")}
              </Link>
              <a
                href="#precios"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-900"
              >
                {tr("landing.ctaPricing")}
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 shadow-2xl">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
              <p className="text-sm font-semibold text-sky-300">
                {t("landing.panelTitle", "Panel operativo")}
              </p>

              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">
                    {t("landing.panelTracker", "Tracker activo")}
                  </span>
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                    {t("landing.panelOnline", "En línea")}
                  </span>
                </div>

                <div className="mt-5 h-36 rounded-2xl border border-slate-700 bg-slate-950 p-4">
                  <div className="h-full rounded-xl border border-sky-500/30 bg-sky-500/10" />
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-slate-950 p-4">
                    <p className="text-xs text-slate-400">{t("landing.panelZones", "Zonas")}</p>
                    <p className="mt-2 text-xl font-bold text-white">12</p>
                  </div>
                  <div className="rounded-2xl bg-slate-950 p-4">
                    <p className="text-xs text-slate-400">{t("landing.panelTrackers", "Trackers")}</p>
                    <p className="mt-2 text-xl font-bold text-white">34</p>
                  </div>
                  <div className="rounded-2xl bg-slate-950 p-4">
                    <p className="text-xs text-slate-400">{t("landing.panelAlerts", "Alertas")}</p>
                    <p className="mt-2 text-xl font-bold text-white">3</p>
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
