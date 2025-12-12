import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * Centro de Ayuda: Novedades / Changelog
 * - Protegido por AuthGuard + Shell desde App.jsx
 * - Universal: lista basada en ENV (opcional) o fallback local.
 * - Monetizable: puedes mostrar novedades PRO primero en el futuro.
 */

export default function ChangelogPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const items = useMemo(() => {
    // Opcional: permitir inyectar un JSON por env var (string)
    // VITE_CHANGELOG_JSON='[{"date":"2025-12-12","title":"...","type":"feature","details":["..."]}]'
    const raw = (import.meta.env.VITE_CHANGELOG_JSON || "").trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Ignorar y usar fallback
      }
    }

    // Fallback local (seguro, no rompe build)
    return [
      {
        date: "2025-12-12",
        type: "feature",
        title: t("help.changelog.items.0.title"),
        details: [
          t("help.changelog.items.0.details.0"),
          t("help.changelog.items.0.details.1"),
        ],
      },
      {
        date: "2025-12-10",
        type: "fix",
        title: t("help.changelog.items.1.title"),
        details: [t("help.changelog.items.1.details.0")],
      },
    ];
  }, [t]);

  const badge = (type) => {
    if (type === "feature") return t("help.changelog.badges.feature");
    if (type === "fix") return t("help.changelog.badges.fix");
    if (type === "perf") return t("help.changelog.badges.perf");
    return t("help.changelog.badges.update");
  };

  const badgeClasses = (type) => {
    if (type === "feature")
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (type === "fix") return "bg-amber-50 text-amber-800 border-amber-200";
    if (type === "perf") return "bg-sky-50 text-sky-700 border-sky-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">
            {t("help.common.breadcrumb")} / {t("help.changelog.breadcrumb")}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {t("help.changelog.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t("help.changelog.subtitle")}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {t("help.common.back")}
          </button>

          <button
            type="button"
            onClick={() => navigate("/inicio")}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            {t("help.common.goHome")}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">
            {t("help.changelog.latest")}
          </div>
          <button
            type="button"
            onClick={() => navigate("/help/faq")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("help.common.viewFaq")}
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {items.map((it, idx) => (
            <div
              key={`${it.date}-${idx}`}
              className="rounded-2xl border border-slate-200 p-4"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">
                    {t("help.changelog.dateLabel")}{" "}
                    <span className="font-mono">{it.date}</span>
                  </div>
                  <div className="mt-1 text-base font-semibold text-slate-900">
                    {it.title}
                  </div>
                </div>

                <div
                  className={
                    "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold " +
                    badgeClasses(it.type)
                  }
                >
                  {badge(it.type)}
                </div>
              </div>

              {Array.isArray(it.details) && it.details.length > 0 ? (
                <ul className="mt-3 list-disc pl-5 text-sm text-slate-600 space-y-1">
                  {it.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
