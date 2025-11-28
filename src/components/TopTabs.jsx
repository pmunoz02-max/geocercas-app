// src/components/TopTabs.jsx
import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function TopTabs() {
  const { role } = useAuth();
  const location = useLocation();

  const tabs = [
    { path: "/inicio", label: "Inicio" },
    { path: "/nueva-geocerca", label: "Nueva geocerca" },
    { path: "/personal", label: "Personal" },

    // 🔹 ACTIVIDADES (solo owner/admin)
    {
      path: "/actividades",
      label: "Actividades",
      onlyFor: ["owner", "admin"],
    },

    { path: "/asignaciones", label: "Asignaciones" },

    // 🔹 COSTOS (nuevo módulo de reportes, solo owner/admin)
    {
      path: "/costos",
      label: "Costos",
      onlyFor: ["owner", "admin"],
    },

    { path: "/tracker", label: "Tracker" },
    {
      path: "/invitar-tracker",
      label: "Invitar tracker",
      onlyFor: ["owner", "admin"],
    },
  ];

  const baseClasses =
    "inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors border";
  const activeClasses = "bg-blue-600 text-white border-blue-600 shadow-sm";
  const inactiveClasses =
    "bg-white text-slate-600 border-slate-200 hover:bg-slate-50";

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <div className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-3 py-2 flex items-center gap-2 overflow-x-auto">
        {tabs.map((tab) => {
          if (tab.onlyFor && !tab.onlyFor.includes(role)) return null;

          const active = isActive(tab.path);

          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={`${baseClasses} ${
                active ? activeClasses : inactiveClasses
              }`}
            >
              {tab.label}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
