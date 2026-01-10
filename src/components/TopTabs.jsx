// src/components/TopTabs.jsx
import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";

/** Helper universal */
function safeText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export default function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const base =
    "no-underline inline-flex items-center px-3 py-1.5 rounded-full " +
    "text-xs sm:text-sm font-semibold whitespace-nowrap border transition-all";

  const inactive =
    "bg-white text-emerald-700 border-emerald-500 hover:bg-emerald-50";

  const active =
    "bg-emerald-600 text-white border-emerald-600 shadow-sm";

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        <div className="flex justify-end py-2">
          <OrgSelector />
        </div>

        <nav className="flex gap-1.5 pb-2 justify-center">
          {tabs.map((tab) => {
            const label = tab.labelKey ? t(tab.labelKey) : tab.label;
            const activeTab = isActive(tab.path);

            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={`${base} ${activeTab ? active : inactive}`}
              >
                {safeText(label)}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
