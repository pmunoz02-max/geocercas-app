import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";

/**
 * TopTabs (FORCE)
 * Objetivo: que TODOS los tabs tengan SIEMPRE el mismo look que "Invitar tracker"
 * incluso si existe CSS global que "lava" links (<a>) o aplica colores heredados.
 *
 * Estrategia:
 * - Clases Tailwind con prefijo "!" (important) para ganar cualquier override.
 * - Inline style para color/border/bg (última capa de prioridad).
 * - Sin subrayado nunca.
 */
export default function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();

  const isActive = (path) => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const baseBtn =
    "no-underline hover:no-underline " +
    "inline-flex items-center gap-2 " +
    "px-4 py-2 rounded-full " +
    "text-sm sm:text-base font-semibold whitespace-nowrap " +
    "!opacity-100 " +
    "border transition-all duration-150 " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2";

  // Inactivo: outline verde (como "Invitar tracker")
  const inactiveBtn =
    "!bg-white !text-emerald-700 !border-emerald-500 " +
    "hover:!bg-emerald-50 hover:!text-emerald-800 hover:!border-emerald-600";

  // Activo: verde sólido
  const activeBtn = "!bg-emerald-600 !text-white !border-emerald-600 shadow-sm";

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        <div className="flex justify-end py-2">
          <OrgSelector />
        </div>

        <nav
          className="flex gap-2 pb-3 overflow-x-auto justify-start sm:justify-center scrollbar-hide"
          aria-label="Navegación principal"
        >
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            const label = tab.labelKey ? t(tab.labelKey) : tab.label || "";

            // Inline style como “capa final” por si algún CSS global está ganando
            const style = active
              ? { backgroundColor: "#059669", borderColor: "#059669", color: "#ffffff" } // emerald-600
              : { backgroundColor: "#ffffff", borderColor: "#10b981", color: "#047857" }; // border emerald-500, text emerald-700

            return (
              <NavLink
                key={tab.path || label}
                to={tab.path}
                className={`${baseBtn} ${active ? activeBtn : inactiveBtn}`}
                style={style}
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
