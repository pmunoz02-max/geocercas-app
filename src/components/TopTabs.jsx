// src/components/layout/TopTabs.jsx
import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * tabs = [
 *   { path: "/inicio", labelKey: "app.tabs.inicio", icon: "🏠" },
 *   { path: "/geocercas", labelKey: "app.tabs.geocercas", icon: "📍" },
 *   { path: "/personal", labelKey: "app.tabs.personal", icon: "👥" },
 *   { path: "/actividades", labelKey: "app.tabs.actividades", icon: "🗂️" },
 *   { path: "/asignaciones", labelKey: "app.tabs.asignaciones", icon: "📌" },
 *   { path: "/reportes", labelKey: "app.tabs.reportes", icon: "📊" },
 *   { path: "/costos", labelKey: "app.tabs.dashboard", icon: "💰" },
 *   { path: "/tracker", labelKey: "app.tabs.tracker", icon: "📡" },
 *   { path: "/invitar-tracker", labelKey: "app.tabs.invitarTracker", icon: "➕" },
 *   { path: "/admin", labelKey: "app.tabs.admin", icon: "⚙️" }
 * ];
 */

export default function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();

  const isActive = (path) => {
    if (!path) return false;
    return (
      location.pathname === path ||
      location.pathname.startsWith(path + "/")
    );
  };

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4">
        <nav className="flex gap-2 py-3 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300">
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            const label = tab.labelKey
              ? t(tab.labelKey)
              : tab.label || "";

            return (
              <NavLink
                key={tab.path || label}
                to={tab.path}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                  whitespace-nowrap transition-all duration-200
                  border
                  ${
                    active
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-md scale-[1.02]"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                  }
                `}
              >
                {tab.icon && (
                  <span className="text-base leading-none">{tab.icon}</span>
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
