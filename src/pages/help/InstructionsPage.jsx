import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export default function InstructionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const tocRaw = t("help.instructions.toc.items", { returnObjects: true });
  const stepsRaw = t("help.instructions.steps.items", { returnObjects: true });
  const moduleCardsRaw = t("help.instructions.moduleCards.items", { returnObjects: true });

  const toc = useMemo(() => (Array.isArray(tocRaw) ? tocRaw : []), [tocRaw]);

  const steps = useMemo(() => (Array.isArray(stepsRaw) ? stepsRaw : []), [stepsRaw]);

  const moduleCards = useMemo(
    () => (Array.isArray(moduleCardsRaw) ? moduleCardsRaw : []),
    [moduleCardsRaw]
  );

  const resultBullets = useMemo(() => {
    const arr = t("help.instructions.resultBullets", { returnObjects: true });
    return Array.isArray(arr) ? arr : [];
  }, [t]);

  const tocLinks = ["#pasos", "#tips", "#modulos", "#resultado", "#recomendacion"];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
      <section className="relative overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-950 via-emerald-800 to-teal-700 px-5 py-6 text-white shadow-xl shadow-emerald-950/15 md:px-7 md:py-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-lime-200/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50">
              {t("help.instructions.badge")}
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                {t("help.instructions.title")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/90">
                {t("help.instructions.subtitle")}
              </p>
            </div>
          </div>

          <div className="w-full rounded-3xl border border-white/15 bg-white/10 p-2 shadow-lg shadow-emerald-950/10 backdrop-blur-sm lg:w-auto">
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="#pasos"
                className="rounded-xl border border-emerald-100 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-lg shadow-emerald-950/5 hover:bg-emerald-50"
              >
                {t("help.instructions.goToSteps")}
              </a>
              <a
                href="#resultado"
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 transition hover:-translate-y-0.5 hover:bg-emerald-800 hover:shadow-md"
              >
                {t("help.instructions.viewResult")}
              </a>
              <button
                type="button"
                onClick={() => navigate("/help/faq")}
                className="rounded-xl border border-emerald-100 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-lg shadow-emerald-950/5 hover:bg-emerald-50"
              >
                {t("help.instructions.viewFaq")}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="sticky top-4 rounded-2xl border border-emerald-100 bg-white p-5 shadow-lg shadow-emerald-950/5">
              <h2 className="text-base font-bold text-gray-900">
                {t("help.instructions.toc.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {t("help.instructions.toc.subtitle")}
              </p>

              <div className="mt-4 space-y-2">
                {toc.map((item, idx) => (
                  <a
                    key={`${idx}-${item}`}
                    className="block rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-emerald-50"
                    href={tocLinks[idx] || "#pasos"}
                  >
                    {item}
                  </a>
                ))}
              </div>

              <div id="recomendacion" className="mt-5 rounded-xl bg-emerald-50/80 p-4">
                <div className="text-xs font-bold text-gray-700">
                  {t("help.instructions.recommendationTitle")}
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  {t("help.instructions.recommendationBody")}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="flex-1 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-emerald-50"
                >
                  {t("help.common.back")}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/inicio")}
                  className="flex-1 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 transition hover:-translate-y-0.5 hover:bg-emerald-800 hover:shadow-md"
                >
                  {t("help.common.goHome")}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div
              id="pasos"
              className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-lg shadow-emerald-950/5"
            >
              <h2 className="text-xl font-extrabold text-gray-900">
                {t("help.instructions.steps.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {t("help.instructions.steps.subtitle")}
              </p>

              <div className="mt-5 space-y-4">
                {steps.map((s, idx) => (
                  <div
                    key={`${idx}-${s?.title || "step"}`}
                    className="rounded-2xl border border-emerald-100 p-5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-sm font-extrabold text-emerald-700">
                        {idx + 1}
                      </div>
                      <div className="w-full">
                        <div className="text-base font-bold text-gray-900">
                          {s.title}
                        </div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                          {(s.items || []).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              id="tips"
              className="mt-6 rounded-3xl border border-emerald-100 bg-white p-6 shadow-lg shadow-emerald-950/5"
            >
              <h2 className="text-xl font-extrabold text-gray-900">
                {t("help.instructions.tipsTitle")}
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-emerald-100 p-5">
                  <div className="text-sm font-bold text-gray-900">
                    {t("help.instructions.bestPractice1Title")}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {t("help.instructions.bestPractice1Body")}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-100 p-5">
                  <div className="text-sm font-bold text-gray-900">
                    {t("help.instructions.bestPractice2Title")}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {t("help.instructions.bestPractice2Body")}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-100 p-5">
                  <div className="text-sm font-bold text-gray-900">
                    {t("help.instructions.bestPractice3Title")}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {t("help.instructions.bestPractice3Body")}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-100 p-5">
                  <div className="text-sm font-bold text-gray-900">
                    {t("help.instructions.bestPractice4Title")}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {t("help.instructions.bestPractice4Body")}
                  </p>
                </div>
              </div>
            </div>

            <div
              id="modulos"
              className="mt-6 rounded-3xl border border-emerald-100 bg-white p-6 shadow-lg shadow-emerald-950/5"
            >
              <h2 className="text-xl font-extrabold text-gray-900">
                {t("help.instructions.moduleCards.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {t("help.instructions.moduleCards.subtitle")}
              </p>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                {moduleCards.map((card, idx) => (
                  <div
                    key={`${idx}-${card?.title || "module"}`}
                    className="flex h-full flex-col rounded-2xl border border-emerald-100 bg-white p-5 shadow-lg shadow-emerald-950/5"
                  >
                    <div className="inline-flex w-fit rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-gray-600">
                      {card?.badge || t("help.common.quickGuideBadge")}
                    </div>
                    <div className="mt-3 text-base font-extrabold text-gray-900">
                      {card?.title || ""}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      {card?.body || ""}
                    </p>

                    {Array.isArray(card?.highlights) && card.highlights.length > 0 ? (
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
                        {card.highlights.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}

                    {card?.path ? (
                      <button
                        type="button"
                        onClick={() => navigate(card.path)}
                        className="mt-4 w-fit rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 transition hover:-translate-y-0.5 hover:bg-emerald-800 hover:shadow-md"
                      >
                        {card?.cta || t("help.common.goHome")}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div
              id="resultado"
              className="mt-6 rounded-3xl border border-emerald-100 bg-white p-6 shadow-lg shadow-emerald-950/5"
            >
              <h2 className="text-xl font-extrabold text-gray-900">
                {t("help.instructions.resultTitle")}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {t("help.instructions.resultIntro")}
              </p>

              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {resultBullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
    </div>
  );
}
