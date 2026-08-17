import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export default function ReportsGuidePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const tocRaw = t("help.reportsGuide.toc.items", { returnObjects: true });
  const sectionsRaw = t("help.reportsGuide.sections.items", { returnObjects: true });
  const cardsRaw = t("help.reportsGuide.cards", { returnObjects: true });
  const tipsRaw = t("help.reportsGuide.tips.items", { returnObjects: true });

  const toc = useMemo(() => (Array.isArray(tocRaw) ? tocRaw : []), [tocRaw]);
  const sections = useMemo(() => (Array.isArray(sectionsRaw) ? sectionsRaw : []), [sectionsRaw]);
  const cards = useMemo(() => (Array.isArray(cardsRaw) ? cardsRaw : []), [cardsRaw]);
  const tips = useMemo(() => (Array.isArray(tipsRaw) ? tipsRaw : []), [tipsRaw]);

  const summaryBullets = useMemo(() => {
    const arr = t("help.reportsGuide.summaryBullets", { returnObjects: true });
    return Array.isArray(arr) ? arr : [];
  }, [t]);

  const tocLinks = ["#resumen", "#filtros", "#exportacion", "#interpretacion", "#tips"];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-5 py-6 text-white shadow-xl shadow-slate-900/10 md:px-7 md:py-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-100">
              {t("help.reportsGuide.badge")}
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                {t("help.reportsGuide.title")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
                {t("help.reportsGuide.subtitle")}
              </p>
            </div>
          </div>

          <div className="w-full rounded-3xl border border-white/15 bg-white/10 p-2 shadow-lg shadow-slate-950/10 backdrop-blur-sm lg:w-auto">
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="#filtros"
                className="rounded-xl border border-white/15 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-lg shadow-slate-950/5 hover:bg-slate-100"
              >
                {t("help.reportsGuide.goToFilters")}
              </a>
              <button
                type="button"
                onClick={() => navigate("/reportes")}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 transition hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-md"
              >
                {t("help.reportsGuide.openReports")}
              </button>
              <button
                type="button"
                onClick={() => navigate("/help/faq")}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                {t("help.common.viewFaq")}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
            <h2 className="text-base font-bold text-slate-900">
              {t("help.reportsGuide.toc.title")}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {t("help.reportsGuide.toc.subtitle")}
            </p>

            <div className="mt-4 space-y-2">
              {toc.map((item, idx) => (
                <a
                  key={`${idx}-${item}`}
                  className="block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  href={tocLinks[idx] || "#resumen"}
                >
                  {item}
                </a>
              ))}
            </div>

            <div id="interpretacion" className="mt-5 rounded-xl bg-emerald-50 p-4">
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-700">
                {t("help.reportsGuide.summaryTitle")}
              </div>
              <div className="mt-1 text-sm text-slate-700">
                {t("help.reportsGuide.summaryBody")}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t("help.common.back")}
              </button>
              <button
                type="button"
                onClick={() => navigate("/inicio")}
                className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {t("help.common.goHome")}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div id="resumen" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5">
            <h2 className="text-xl font-extrabold text-slate-900">
              {t("help.reportsGuide.overviewTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("help.reportsGuide.overviewBody")}
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((card, idx) => (
                <div
                  key={`${idx}-${card?.title || "card"}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    {card?.tag || "REPORT"}
                  </div>
                  <div className="mt-2 text-base font-extrabold text-slate-900">
                    {card?.title || ""}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {card?.body || ""}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div id="filtros" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5">
            <h2 className="text-xl font-extrabold text-slate-900">
              {t("help.reportsGuide.sections.title")}
            </h2>

            <div className="mt-5 space-y-4">
              {sections.map((section, idx) => (
                <div
                  key={`${idx}-${section?.title || "section"}`}
                  className="rounded-2xl border border-slate-200 p-5"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-sm font-extrabold text-emerald-700">
                      {idx + 1}
                    </div>
                    <div className="w-full">
                      <div className="text-base font-bold text-slate-900">
                        {section?.title || ""}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {section?.body || ""}
                      </p>
                      {Array.isArray(section?.bullets) && section.bullets.length > 0 ? (
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                          {section.bullets.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div id="exportacion" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5">
            <h2 className="text-xl font-extrabold text-slate-900">
              {t("help.reportsGuide.exportTitle")}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-bold text-slate-900">
                  {t("help.reportsGuide.exportPrimaryTitle")}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t("help.reportsGuide.exportPrimaryBody")}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-bold text-slate-900">
                  {t("help.reportsGuide.exportSecondaryTitle")}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t("help.reportsGuide.exportSecondaryBody")}
                </p>
              </div>
            </div>
          </div>

          <div id="tips" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5">
            <h2 className="text-xl font-extrabold text-slate-900">
              {t("help.reportsGuide.tips.title")}
            </h2>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {tips.map((tip, idx) => (
                <div
                  key={`${idx}-${tip?.title || "tip"}`}
                  className="rounded-2xl border border-slate-200 p-5"
                >
                  <div className="text-sm font-bold text-slate-900">{tip?.title || ""}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{tip?.body || ""}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5">
            <h2 className="text-xl font-extrabold text-slate-900">
              {t("help.reportsGuide.resultTitle")}
            </h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
              {summaryBullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
