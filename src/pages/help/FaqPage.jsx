import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export default function FaqPage() {
  const { t } = useTranslation();

  const itemsRaw = t("help.faq.items", { returnObjects: true });

  const items = useMemo(
    () => (Array.isArray(itemsRaw) ? itemsRaw : []),
    [itemsRaw]
  );

  return (
    <div className="max-w-3xl mx-auto p-6 flex flex-col gap-6">
      <div className="app-card p-5 flex flex-col gap-4">
        <p className="text-xs text-slate-500">
          {t("help.faq.breadcrumb")}
        </p>
        <h1 className="text-2xl font-semibold">{t("help.faq.title")}</h1>
        <p className="text-sm text-slate-600">{t("help.faq.subtitle")}</p>

        <div className="flex flex-col gap-4">
          {items.map((item, idx) => (
            <section
              key={idx}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
            >
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {item?.q || ""}
              </h3>
              <p className="mt-3 text-[15px] leading-7 text-slate-700 dark:text-slate-200">
                {item?.a || ""}
              </p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}