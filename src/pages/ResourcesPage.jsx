import IncidentsHelp from "../components/IncidentsHelp";
import VisitsInfoCard from "../components/VisitsInfoCard";
import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthSafe } from "@/context/auth.js";

const LOCAL_COPY = {
  es: {
    badge: "Recursos",
    title: "Recursos GeoField GPS",
    subtitle:
      "Descarga materiales listos para usar y acelera onboarding, capacitación y operación diaria.",
    downloadLabel: "Descargar",
    viewPdf: "Ver PDF",
    pdfDetails: "Español · 4 páginas · Septiembre 2026",
    pdfScope: "Este PDF cubre instalación y seguimiento GPS. Para fotos, uso sin conexión y Android de Incidencias, consulta la guía web de esta página.",
    openGuide: "Abrir guía",
    openMap: "Abrir mapa",
    backHome: "Volver al inicio",
    cards: {
      pdf: {
        title: "Manual rápido GeoField GPS (PDF)",
        description:
          "Resumen operativo para instalación, login y verificación de envío de posición.",
      },
      reports: {
        title: "Guía de reportes",
        description:
          "Cómo interpretar actividad, posiciones y exportables para supervisión operativa.",
      },
      incidentMap: {
        title: "Mapa de incidencias",
        description: "Consulta la afectación con colores de semáforo, usa los filtros de fecha, parcela o estado y revisa los gráficos de evolución. La guía incluye cómo registrar las medidas tomadas.",
      },
    },
  },
  en: {
    badge: "Resources",
    title: "GeoField GPS Resources",
    subtitle:
      "Download ready-to-use materials to speed up onboarding, training, and daily operations.",
    downloadLabel: "Download",
    viewPdf: "View PDF",
    pdfDetails: "English · 4 pages · September 2026",
    pdfScope: "This PDF covers setup and GPS tracking. For incident photos, offline use and Android access, read the web guide on this page.",
    openGuide: "Open guide",
    openMap: "Open map",
    backHome: "Back to home",
    cards: {
      pdf: {
        title: "GeoField GPS Quick Manual (PDF)",
        description:
          "Operational summary for installation, login, and position delivery checks.",
      },
      reports: {
        title: "Reports guide",
        description:
          "How to read activity, positions, and exports for field supervision.",
      },
      incidentMap: {
        title: "Incident map",
        description: "See severity at a glance, filter by date, plot or status, and review the charts. The guide also explains how to record actions taken.",
      },
    },
  },
  fr: {
    badge: "Ressources",
    title: "Ressources GeoField GPS",
    subtitle:
      "Téléchargez des supports prêts à l'emploi pour accélérer l'onboarding, la formation et l'opération.",
    downloadLabel: "Télécharger",
    viewPdf: "Voir le PDF",
    pdfDetails: "Français · 4 pages · Septembre 2026",
    pdfScope: "Ce PDF décrit l’installation et le suivi GPS. Pour les photos, l’usage hors connexion et l’accès Android aux incidents, consultez le guide web de cette page.",
    openGuide: "Ouvrir le guide",
    openMap: "Ouvrir la carte",
    backHome: "Retour à l'accueil",
    cards: {
      pdf: {
        title: "Guide rapide GeoField GPS (PDF)",
        description:
          "Résumé opérationnel pour installation, connexion et vérification des positions.",
      },
      reports: {
        title: "Guide des rapports",
        description:
          "Comment lire activité, positions et exports pour le pilotage terrain.",
      },
      incidentMap: {
        title: "Carte des incidents",
        description: "Repérez la gravité par couleur, filtrez par date, parcelle ou statut, et consultez les graphiques. Le guide explique aussi comment consigner les mesures prises.",
      },
    },
  },
};

function resolveLang(value) {
  const lang = String(value || "es").trim().toLowerCase();
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("fr")) return "fr";
  return "es";
}

export default function ResourcesPage() {
  const { t, i18n } = useTranslation();
  const { user, currentRole, role, currentOrgId, currentOrg, orgId } = useAuthSafe();

  const lang = resolveLang(i18n?.resolvedLanguage || i18n?.language);
  const copy = LOCAL_COPY[lang] || LOCAL_COPY.es;
  const hostname = typeof window === "undefined" ? "" : window.location.hostname;
  const incidentsAvailable = ["preview.tugeocercas.com", "app.tugeocercas.com"].includes(hostname);
  const effectiveRole = String(currentRole || role || "").trim().toLowerCase();
  const canOpenMap = Boolean(user && (currentOrgId || currentOrg?.id || orgId) && ["owner", "admin"].includes(effectiveRole));

  const cards = useMemo(
    () => [
      ...(incidentsAvailable ? [{
        key: "incidentMap",
        format: "WEB",
        href: `/help/instructions?lang=${lang}#incidencias`,
      }] : []),
      {
        key: "pdf",
        format: "PDF",
        href: `/resources/geofield-gps-manual-${lang}.pdf`,
      },
      {
        key: "reports",
        format: "REPORTS",
        href: "/help/reports",
      },
    ],
    [lang, incidentsAvailable]
  );

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 dark:border-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-200">
              {copy.badge}
            </span>

            <Link
              to="/"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {copy.backHome}
            </Link>
          </div>

          <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">
            {t("resources.title", { defaultValue: copy.title })}
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
            {t("resources.subtitle", { defaultValue: copy.subtitle })}
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <VisitsInfoCard detailed />
            <IncidentsHelp />
            {cards.map((card) => {
              const cardCopy = copy.cards[card.key] || { title: "", description: "" };
              const title = t(`resources.cards.${card.key}.title`, {
                defaultValue: cardCopy.title,
              });
              const description = t(`resources.cards.${card.key}.description`, {
                defaultValue: cardCopy.description,
              });

              return (
                <article
                  key={card.key}
                  className="flex h-full flex-col rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/60"
                >
                  <div className="inline-flex w-fit rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white dark:bg-slate-100 dark:text-slate-900">
                    {card.format}
                  </div>

                  <h2 className="mt-4 text-base font-semibold leading-6 text-slate-900 dark:text-slate-100">
                    {title}
                  </h2>

                  <p className="mt-2 flex-1 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    {description}
                  </p>

                  {card.key === "pdf" ? (
                    <div className="mt-5">
                      <p className="mb-3 text-xs text-slate-500 dark:text-slate-300">{copy.pdfDetails}</p>
                      <p className="mb-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.pdfScope}</p>
                      <div className="flex flex-wrap gap-2">
                        <a href={card.href} target="_blank" rel="noopener noreferrer"
                          aria-label={`${copy.viewPdf}: ${title}`}
                          className="inline-flex items-center justify-center rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300">
                          {copy.viewPdf}
                        </a>
                        <a href={card.href} download={`geofield-gps-manual-${lang}.pdf`}
                          aria-label={`${copy.downloadLabel}: ${title}`}
                          className="inline-flex items-center justify-center rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                          {copy.downloadLabel}
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        to={card.href}
                        aria-label={`${copy.openGuide}: ${title}`}
                        className="inline-flex flex-1 items-center justify-center rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                      >
                        {copy.openGuide}
                      </Link>
                      {card.key === "incidentMap" && canOpenMap && (
                        <Link
                          to={`/mapa-incidencias?lang=${lang}`}
                          className="inline-flex flex-1 items-center justify-center rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"
                        >
                          {copy.openMap}
                        </Link>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
