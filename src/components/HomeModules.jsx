import { Link, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPinned, Users, ListChecks, CalendarCheck, Camera, TriangleAlert, CalendarDays, ChartNoAxesCombined, FileChartColumn, Wallet, Radio, UserPlus, Tags, CreditCard, BookOpen, Shield, ArrowUpRight } from "lucide-react";

const modules = {
  geocerca: [MapPinned, "field"], personal: [Users, "field"],
  actividades: [ListChecks, "field"], asignaciones: [CalendarCheck, "field"],
  visitas: [Camera, "field"], incidents: [TriangleAlert, "field"],
  tracker: [Radio, "field"], invitarTracker: [UserPlus, "field"],
  planificacion: [CalendarDays, "analysis"], benchmarking: [ChartNoAxesCombined, "analysis"],
  reportes: [FileChartColumn, "analysis"], panelCostos: [Wallet, "analysis"],
  pricing: [Tags, "account"], billing: [CreditCard, "account"],
  resources: [BookOpen, "account"], admins: [Shield, "account"],
};

export default function HomeModules() {
  const { navigationTabs = [] } = useOutletContext() || {};
  const { t, i18n } = useTranslation();
  const lang = String(i18n.resolvedLanguage || i18n.language || "es").slice(0, 2);
  const tabs = navigationTabs.filter(tab => tab.path !== "/inicio");
  return (
    <nav aria-label={t("moduleHub.navigation")} className="space-y-7">
      {["field", "analysis", "account"].map(group => {
        const items = tabs.filter(tab => (modules[tab.labelKey.split(".").at(-1)]?.[1] || "account") === group);
        if (!items.length) return null;
        return (
          <section key={group} aria-labelledby={"modules-" + group}>
            <h2 id={"modules-" + group} className="mb-3 text-lg font-bold text-slate-900">{t("moduleHub.groups." + group)}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {items.map(tab => {
                const key = tab.labelKey.split(".").at(-1);
                const Icon = modules[key]?.[0] || BookOpen;
                return (
                  <Link key={tab.path} to={tab.path + "?lang=" + lang}
                    className="group flex min-w-0 items-start gap-3 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 transition group-hover:bg-emerald-700 group-hover:text-white"><Icon size={23} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-slate-950">{t(tab.labelKey)}</span>
                      <span className="mt-1 block text-sm leading-5 text-slate-600">{t("moduleHub.descriptions." + key)}</span>
                    </span>
                    <ArrowUpRight size={16} aria-hidden="true" className="mt-1 shrink-0 text-emerald-600" />
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </nav>
  );
}
