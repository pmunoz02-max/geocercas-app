import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export default function InstructionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const steps = useMemo(() => {
    const arr = t("help.instructions.steps", { returnObjects: true });
    return Array.isArray(arr) ? arr : [];
  }, [t]);

  const resultBullets = useMemo(() => {
    const arr = t("help.instructions.resultBullets", { returnObjects: true });
    return Array.isArray(arr) ? arr : [];
  }, [t]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            {t("help.common.quickGuideBadge")}
          </div>

          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                {t("help.instructions.title")}
              </h1>
              <p className="mt-2 max-w-2xl text-slate-600">
                {t("help.instructions.subtitle")}
              </p>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a
                href="#pasos"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                {t("help.instructions.jumpToSteps")}
              </a>
              <a
                href="#resultado"
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                {t("help.instructions.viewResult")}
              </a>
              <button
                type="button"
                onClick={() => navigate("/help/faq")}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                {t("help.common.viewFaq")}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-slate-900">
                {t("help.instructions.tocTitle")}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {t("help.instructions.tocSubtitle")}
              </p>

              <div className="mt-4 space-y-2">
                <a
                  className="block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  href="#pasos"
                >
                  {t("help.instructions.tocSteps")}
                </a>
                <a
                  className="block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  href="#tips"
                >
                  {t("help.instructions.tocTips")}
                </a>
                <a
                  className="block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  href="#resultado"
                >
                  {t("help.instructions.tocResult")}
                </a>
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <div className="text-xs font-bold text-slate-700">
                  {t("help.instructions.recommendationTitle")}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {t("help.instructions.recommendationBody")}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
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

          <div className="lg:col-span-2">
            <div
              id="pasos"
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-extrabold text-slate-900">
                {t("help.instructions.stepsTitle")}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {t("help.instructions.stepsSubtitle")}
              </p>

              <div className="mt-5 space-y-4">
                {steps.map((s, idx) => (
                  <div
                    key={`${idx}-${s?.title || "step"}`}
                    className="rounded-2xl border border-slate-200 p-5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-sm font-extrabold text-emerald-700">
                        {idx + 1}
                      </div>
                      <div className="w-full">
                        <div className="text-base font-bold text-slate-900">
                          {s.title}
                        </div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                          {(s.bullets || []).map((b) => (
                            <li key={b}>{b}</li>
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
              className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-extrabold text-slate-900">
                {t("help.instructions.tipsTitle")}
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-5">
                  <div className="text-sm font-bold text-slate-900">
                    {t("help.instructions.bestPractice1Title")}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {t("help.instructions.bestPractice1Body")}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-5">
                  <div className="text-sm font-bold text-slate-900">
                    {t("help.instructions.bestPractice2Title")}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {t("help.instructions.bestPractice2Body")}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-5">
                  <div className="text-sm font-bold text-slate-900">
                    {t("help.instructions.bestPractice3Title")}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {t("help.instructions.bestPractice3Body")}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-5">
                  <div className="text-sm font-bold text-slate-900">
                    {t("help.instructions.bestPractice4Title")}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {t("help.instructions.bestPractice4Body")}
                  </p>
                </div>
              </div>
            </div>

            <div
              id="resultado"
              className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-extrabold text-slate-900">
                {t("help.instructions.resultTitle")}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {t("help.instructions.resultIntro")}
              </p>

              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {resultBullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
