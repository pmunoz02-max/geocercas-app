import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";

/**
 * TopTabs
 * - Todas las "píldoras" con el MISMO formato que "Invitar tracker" (outline verde).
 * - Activo: fondo verde + texto blanco.
 * - Inactivo: fondo blanco + borde verde + texto verde (siempre visible, no solo en hover).
 * - Scroll horizontal limpio (sin barra gris en Windows).
 */
export default function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();

  const isActive = (path) => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const baseBtn =
    "flex items-center gap-2 px-4 py-2 rounded-full text-sm sm:text-base font-semibold whitespace-nowrap border transition-all duration-150 " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2";

  // Igual al estilo de "Invitar tracker" (outline verde)
  const inactiveBtn =
    "bg-white text-emerald-700 border-emerald-400 hover:bg-emerald-50 hover:border-emerald-500 hover:text-emerald-800";

  // Activo: verde sólido
  const activeBtn =
    "bg-emerald-600 text-white border-emerald-600 shadow-sm";

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        {/* Selector de organización */}
        <div className="flex justify-end py-2">
          <OrgSelector />
        </div>

        {/* Tabs */}
        <nav
          className="
            flex gap-2 pb-3
            overflow-x-auto
            justify-start sm:justify-center
            [-ms-overflow-style:none]
            [scrollbar-width:none]
            [&::-webkit-scrollbar]:hidden
          "
        >
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            const label = tab.labelKey ? t(tab.labelKey) : tab.label || "";

            return (
              <NavLink
                key={tab.path || label}
                to={tab.path}
                className={`${baseBtn} ${active ? activeBtn : inactiveBtn}`}
              >
                {tab.icon && <span className="text-base">{tab.icon}</span>}
                <span className="leading-none">{label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
