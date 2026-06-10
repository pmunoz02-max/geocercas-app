import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const LOCAL_COPY = {
  es: {
    badge: "Recursos",
    title: "Recursos GeoField GPS",
    subtitle:
      "Descarga materiales listos para usar y acelera onboarding, capacitación y operación diaria.",
    downloadLabel: "Descargar",
    watchLabel: "Ver video",
    comingSoon: "Próximamente",
    backHome: "Volver al inicio",
    cards: {
      pdf: {
        title: "Manual rápido GeoField GPS (PDF)",
        description:
          "Resumen operativo para instalación, login y verificación de envío de posición.",
      },
      pptx: {
        title: "Presentación de entrenamiento (PPTX)",
        description:
          "Diapositivas para formar equipos de campo y estandarizar el flujo de uso.",
      },
      video: {
        title: "Vídeo tutorial de puesta en marcha",
        description:
          "Guía visual para onboarding inicial del tracker y validación de telemetría.",
      },
      trackerGuide: {
        title: "Guía tracker",
        description:
          "Paso a paso para login, permisos y flujo operativo en GeoField GPS.",
      },
      geofences: {
        title: "Guía de geocercas",
        description:
          "Buenas prácticas para crear geocercas estables y reducir falsos positivos.",
      },
      reports: {
        title: "Guía de reportes",
        description:
          "Cómo interpretar actividad, posiciones y exportables para supervisión operativa.",
      },
    },
  },
  en: {
    badge: "Resources",
    title: "GeoField GPS Resources",
    subtitle:
      "Download ready-to-use materials to speed up onboarding, training, and daily operations.",
    downloadLabel: "Download",
    watchLabel: "Watch video",
    comingSoon: "Coming soon",
    backHome: "Back to home",
    cards: {
      pdf: {
        title: "GeoField GPS Quick Manual (PDF)",
        description:
          "Operational summary for installation, login, and position delivery checks.",
      },
      pptx: {
        title: "Training deck (PPTX)",
        description:
          "Slides to train field teams and standardize usage flow.",
      },
      video: {
        title: "Getting started video tutorial",
        description:
          "Visual onboarding guide for tracker setup and telemetry verification.",
      },
      trackerGuide: {
        title: "Tracker guide",
        description:
          "Step-by-step instructions for login, permissions, and daily runtime flow.",
      },
      geofences: {
        title: "Geofences guide",
        description:
          "Best practices to create robust boundaries and reduce false positives.",
      },
      reports: {
        title: "Reports guide",
        description:
          "How to read activity, positions, and exports for field supervision.",
      },
    },
  },
  fr: {
    badge: "Ressources",
    title: "Ressources GeoField GPS",
    subtitle:
      "Téléchargez des supports prêts à l'emploi pour accélérer l'onboarding, la formation et l'opération.",
    downloadLabel: "Télécharger",
    watchLabel: "Voir la vidéo",
    comingSoon: "Bientôt disponible",
    backHome: "Retour à l'accueil",
    cards: {
      pdf: {
        title: "Guide rapide GeoField GPS (PDF)",
        description:
          "Résumé opérationnel pour installation, connexion et vérification des positions.",
      },
      pptx: {
        title: "Présentation de formation (PPTX)",
        description:
          "Diapositives pour former les équipes terrain et standardiser l'utilisation.",
      },
      video: {
        title: "Tutoriel vidéo de démarrage",
        description:
          "Guide visuel d'onboarding initial pour tracker et validation de télémétrie.",
      },
      trackerGuide: {
        title: "Guide tracker",
        description:
          "Étapes pour connexion, permissions et usage quotidien de GeoField GPS.",
      },
      geofences: {
        title: "Guide des géofences",
        description:
          "Bonnes pratiques pour créer des périmètres fiables.",
      },
      reports: {
        title: "Guide des rapports",
        description:
          "Comment lire activité, positions et exports pour le pilotage terrain.",
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

  const lang = resolveLang(i18n?.resolvedLanguage || i18n?.language);
  const copy = LOCAL_COPY[lang] || LOCAL_COPY.es;

  const cards = useMemo(
    () => [
      {
        key: "pdf",
        format: "PDF",
        available: false,
      },
      {
        key: "pptx",
        format: "PPTX",
        available: false,
      },
      {
        key: "video",
        format: "VIDEO",
        available: false,
      },
      {
        key: "trackerGuide",
        format: "GUIDE",
        available: false,
      },
      {
        key: "geofences",
        format: "GEOFENCES",
        available: false,
      },
      {
        key: "reports",
        format: "REPORTS",
        available: false,
      },
    ],
    []
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

          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

                  <button
                    type="button"
                    disabled
                    className="mt-5 inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-slate-300 bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 opacity-80 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  >
                    {t("resources.comingSoon", { defaultValue: copy.comingSoon })}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
