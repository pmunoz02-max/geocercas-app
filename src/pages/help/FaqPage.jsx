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
            <section key={idx} className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold">{item?.q || ""}</h3>
              <p className="mt-1 text-sm text-slate-600">{item?.a || ""}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}