import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";

/**
 * TopTabs – COMPACT
 * - Todos los botones estilo "Invitar tracker"
 * - Tamaño reducido para que entren en una sola fila
 * - Sin scroll horizontal
 */
export default function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const base =
    "no-underline hover:no-underline inline-flex items-center " +
    "px-3 py-1.5 rounded-full " +                 // ⬅️ menos padding
    "text-xs sm:text-sm font-semibold " +          // ⬅️ texto más chico
    "whitespace-nowrap border " +
    "transition-all duration-150 " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2";

  const inactive =
    "bg-white text-emerald-700 border-emerald-500 " +
    "hover:bg-emerald-50 hover:text-emerald-800";

  const active =
    "bg-emerald-600 text-white border-emerald-600 shadow-sm";

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        {/* Selector de organización */}
        <div className="flex justify-end py-2">
          <OrgSelector />
        </div>

        {/* Tabs */}
        <nav className="flex gap-1.5 pb-2 justify-center">
          {tabs.map((tab) => {
            const label = tab.labelKey ? t(tab.labelKey) : tab.label;
            const activeTab = isActive(tab.path);

            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={`${base} ${activeTab ? active : inactive}`}
                style={
                  activeTab
                    ? { backgroundColor: "#059669", borderColor: "#059669", color: "#fff" }
                    : { backgroundColor: "#fff", borderColor: "#10b981", color: "#047857" }
                }
              >
                {label}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
