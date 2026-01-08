import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";

export default function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();

  const isActive = (path) => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  return (
    <div className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        <div className="flex justify-end py-2">
          <OrgSelector />
        </div>

        <nav
          className="
            flex gap-2
            pb-3
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
                className={`
                  flex items-center gap-2
                  px-4 py-2
                  rounded-full
                  text-sm sm:text-base
                  font-semibold
                  whitespace-nowrap
                  border
                  transition-all duration-150
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2
                  ${
                    active
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
                      : "bg-slate-50 text-slate-900 border-slate-300 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-800"
                  }
                `}
                style={{ textShadow: active ? "0 1px 0 rgba(0,0,0,0.15)" : "none" }}
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
