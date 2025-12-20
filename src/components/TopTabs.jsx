import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";

/**
 * tabs = [
 *   { path: "/inicio", labelKey: "app.tabs.inicio", icon: "🏠" },
 *   { path: "/geocercas", labelKey: "app.tabs.geocercas", icon: "📍" },
 *   ...
 * ];
 */

export default function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();

  const isActive = (path) => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  return (
    <div className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-2 sm:px-4">
        {/* Fila superior: selector de organización (compacta en móvil) */}
        <div className="flex justify-end py-1.5 sm:py-2">
          <OrgSelector />
        </div>

        {/* Tabs */}
        <nav
          className="
            flex
            gap-1.5 sm:gap-3
            pb-2.5 sm:pb-3
            overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300
            justify-start sm:justify-center
          "
        >
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            const label = tab.labelKey ? t(tab.labelKey) : tab.label || "";

            return (
              <NavLink
                key={tab.path || label}
                to={tab.path}
                className={`
                  group
                  flex items-center gap-1.5 sm:gap-2
                  px-2.5 sm:px-5 py-1.5 sm:py-2.5
                  rounded-full
                  text-[12px] sm:text-[0.95rem]
                  font-semibold
                  whitespace-nowrap
                  border
                  transition-all duration-200 ease-out
                  shadow-sm
                  ${
                    active
                      ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-emerald-600 shadow-md scale-[1.03]"
                      : "bg-slate-50/90 text-slate-700 border-slate-200 hover:bg-white hover:border-emerald-300 hover:shadow-md hover:-translate-y-[1px]"
                  }
                `}
              >
                {tab.icon && (
                  <span
                    className={`
                      text-sm sm:text-base leading-none
                      ${active ? "scale-110" : "opacity-80 group-hover:opacity-100"}
                    `}
                  >
                    {tab.icon}
                  </span>
                )}
                <span>{label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
