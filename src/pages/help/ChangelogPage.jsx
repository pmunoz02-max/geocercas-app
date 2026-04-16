import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function ChangelogPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const releasesRaw = t("help.changelog.releases", { returnObjects: true });
  const versions = Array.isArray(releasesRaw) ? releasesRaw : [];

  const badgeLabel = (type) => {
    if (type === "feature") return t("help.changelog.badges.feature");
    if (type === "fix") return t("help.changelog.badges.fix");
    if (type === "improvement") return t("help.changelog.badges.improvement");
    return type;
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs text-slate-500">
            {t("help.changelog.breadcrumb")}
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
            onClick={() => navigate(-1)}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            {t("help.changelog.back")}
          </button>
          <button
            onClick={() => navigate("/inicio")}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {t("help.changelog.goHome")}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6">
        {versions.map((v, vi) => (
          <div
            key={vi}
            className="rounded-2xl border bg-white p-4 shadow-sm"
          >
            <div className="mb-3 text-sm text-slate-500">
              {v.date ? `${v.version} · ${v.date}` : v.version}
            </div>

            <div className="space-y-4">
              {(Array.isArray(v?.changes) ? v.changes : (v?.items || [])).map((c, ci) => {
                const isSimple = typeof c === "string";

                if (isSimple) {
                  return (
                    <ul key={ci} className="list-disc pl-5 text-sm text-slate-600">
                      <li>{c}</li>
                    </ul>
                  );
                }

                const details = Array.isArray(c?.details) ? c.details : [];

                return (
                  <div key={ci}>
                    <div className="flex items-center gap-2">
                      {c?.type ? (
                        <span className="rounded-full border px-2 py-0.5 text-xs">
                          {badgeLabel(c.type)}
                        </span>
                      ) : null}
                      <span className="font-semibold">{c?.title || ""}</span>
                    </div>

                    {details.length > 0 ? (
                      <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                        {details.map((d, di) => (
                          <li key={di}>{d}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
