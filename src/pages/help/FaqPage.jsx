import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-5 py-4 flex items-start justify-between gap-4"
        aria-expanded={open ? "true" : "false"}
      >
        <div className="text-sm font-semibold text-slate-900">{q}</div>
        <div
          className={
            open
              ? "mt-0.5 shrink-0 h-6 w-6 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-bold"
              : "mt-0.5 shrink-0 h-6 w-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-bold"
          }
        >
          {open ? "–" : "+"}
        </div>
      </button>

      {open ? (
        <div className="px-5 pb-4 text-sm text-slate-600">
          <div className="border-t border-slate-100 pt-3">{a}</div>
        </div>
      ) : null}
    </div>
  );
}

export default function FaqPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const allSections = useMemo(() => {
    const faqSections = t("help.faq.sections", { returnObjects: true });
    const onboardingSections = t("help.onboarding.sections", { returnObjects: true });
    const trackerSections = t("help.tracker.sections", { returnObjects: true });
    const troubleshootingSections = t("help.troubleshooting.sections", { returnObjects: true });
    const geofencesSections = t("help.geofences.sections", { returnObjects: true });
    const accountSections = t("help.account.sections", { returnObjects: true });

    return [
      {
        title: t("help.faq.title"),
        subtitle: t("help.faq.subtitle"),
        sections: faqSections,
      },
      {
        title: t("help.onboarding.title"),
        subtitle: t("help.onboarding.subtitle"),
        sections: onboardingSections,
      },
      {
        title: t("help.tracker.title"),
        subtitle: t("help.tracker.subtitle"),
        sections: trackerSections,
      },
      {
        title: t("help.troubleshooting.title"),
        subtitle: t("help.troubleshooting.subtitle"),
        sections: troubleshootingSections,
      },
      {
        title: t("help.geofences.title"),
        subtitle: t("help.geofences.subtitle"),
        sections: geofencesSections,
      },
      {
        title: t("help.account.title"),
        subtitle: t("help.account.subtitle"),
        sections: accountSections,
      },
    ].filter((block) => Array.isArray(block.sections) && block.sections.length > 0);
  }, [t]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            {t("help.common.badge")}
          </div>

          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                {t("help.faq.title")}
              </h1>
              <p className="mt-2 max-w-2xl text-slate-600">
                {t("help.faq.subtitle")}
              </p>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => navigate("/help/instructions")}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                {t("help.faq.seeQuickGuide")}
              </button>
              <button
                type="button"
                onClick={() => navigate("/inicio")}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                {t("help.faq.backToPanel")}
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                {t("help.common.back")}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {allSections.map((block) => (
            <div key={block.title} className="space-y-3">
              <div>
                <div className="text-sm font-bold text-slate-800">{block.title}</div>
                <div className="mt-1 text-sm text-slate-600">{block.subtitle}</div>
              </div>
              <div className="space-y-6">
                {block.sections.map((sec) => (
                  <div key={sec.title} className="space-y-3">
                    <div className="text-sm font-bold text-slate-800">{sec.title}</div>
                    <div className="space-y-3">
                      {(sec.items || []).map((it) => (
                        <FaqItem key={it.q} q={it.q} a={it.a} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
