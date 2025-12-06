// src/components/layout/TopTabs.jsx
import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * Espera un prop `tabs` con esta forma:
 *
 * const tabs = [
 *   { path: "/app/inicio",        labelKey: "app.tabs.inicio" },
 *   { path: "/app/geocercas/new", labelKey: "app.tabs.nuevaGeocerca" },
 *   { path: "/app/personal",      labelKey: "app.tabs.personal" },
 *   { path: "/app/actividades",   labelKey: "app.tabs.actividades" },
 *   { path: "/app/asignaciones",  labelKey: "app.tabs.asignaciones" },
 *   { path: "/app/reportes",      labelKey: "app.tabs.reportes" },
 *   { path: "/app/dashboard",     labelKey: "app.tabs.dashboard" },
 *   { path: "/app/tracker",       labelKey: "app.tabs.tracker" },
 *   { path: "/app/invitar-tracker", labelKey: "app.tabs.invitarTracker" },
 *   { path: "/app/admins",        labelKey: "app.tabs.admins" }
 * ];
 */

function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();

  const isActive = (tabPath) => {
    if (!tabPath) return false;
    // activa por coincidencia inicial de path
    return location.pathname === tabPath || location.pathname.startsWith(tabPath + "/");
  };

  return (
    <div className="w-full flex justify-center mt-4">
      <nav className="flex space-x-2 bg-slate-100 rounded-full px-2 py-1 overflow-x-auto max-w-full">
        {tabs.map((tab) => {
          const active = isActive(tab.path);

          // Texto a mostrar:
          // 1) si hay labelKey -> i18n
          // 2) si no, usa label “fijo” para compatibilidad
          const label = tab.labelKey
            ? t(tab.labelKey)
            : tab.label || "";

          const baseClasses =
            "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border";
          const activeClasses =
            "bg-blue-600 text-white border-blue-600 shadow-sm";
          const inactiveClasses =
            "bg-white text-slate-800 border-slate-200 hover:bg-slate-50";

          return (
            <NavLink
              key={tab.path || label}
              to={tab.path}
              className={active ? `${baseClasses} ${activeClasses}` : `${baseClasses} ${inactiveClasses}`}
            >
              {label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

export default TopTabs;
