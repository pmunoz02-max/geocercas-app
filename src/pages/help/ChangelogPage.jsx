import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function ChangelogPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const versions = t("help.changelog.items", {
    returnObjects: true,
    defaultValue: [],
  });

  const badgeLabel = (type) => {
    if (type === "feature") return t("help.changelog.badges.feature");
    if (type === "fix") return t("help.changelog.badges.fix");
    if (type === "improvement") return t("help.changelog.badges.improvement");
    return type;
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs text-slate-500">
            {t("help.common.breadcrumb")} / {t("help.changelog.title")}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">
            {t("help.changelog.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t("help.changelog.subtitle")}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("help.common.back")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/inicio")}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {t("help.common.goHome")}
          </button>
        </div>
      </div>

      {versions?.length ? (
        <div className="space-y-6">
          {versions.map((v, vi) => (
            <div key={vi} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
              <div className="mb-3 text-sm text-slate-500">
                {v.version} · {v.date}
              </div>

              <div className="space-y-4">
                {v.changes?.map((c, ci) => (
                  <div key={ci}>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-700">
                        {badgeLabel(c.type)}
                      </span>
                      <span className="font-semibold text-slate-900">{c.title}</span>
                    </div>

                    <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                      {c.details?.map((d, di) => (
                        <li key={di}>{d}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          {t("help.changelog.subtitle")}
        </div>
      )}
    </div>
  );
}
