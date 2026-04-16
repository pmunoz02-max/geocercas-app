import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export default function FaqPage() {
  const { t } = useTranslation();

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
    <div className="max-w-3xl mx-auto p-6 flex flex-col gap-6">
      {allSections.map((block, idx) => (
        <div key={idx} className="app-card p-5 flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">{block.title}</h2>
            {block.subtitle && (
              <p className="text-sm text-slate-500">{block.subtitle}</p>
            )}
          </div>

          {block.sections.map((section, sIdx) => (
            <div key={sIdx} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{section.title}</h3>

              {section.items.map((item, iIdx) => (
                <div key={iIdx} className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{item.q}</p>
                  <p className="text-sm text-slate-600">{item.a}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}