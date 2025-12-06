// src/components/TopTabs.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function TopTabs({ tabs }) {
  const { t } = useTranslation();

  return (
    <nav className="w-full flex justify-center mt-4 mb-4">
      {/* Contenedor con fondo suave y soporte para scroll horizontal en móvil */}
      <div className="inline-flex max-w-full items-center overflow-x-auto rounded-full bg-slate-50/80 px-2 py-1 shadow-inner">
        <div className="flex flex-nowrap gap-2">
          {tabs.map((tab) => {
            const label =
              tab.labelKey ? t(tab.labelKey) : tab.label ?? "";

            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  [
                    "px-4 md:px-5 py-1.5 md:py-2 rounded-full text-sm md:text-[15px] font-medium whitespace-nowrap border transition-all duration-150",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-50",
                    isActive
                      ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200 scale-[1.03]"
                      : "bg-white/80 text-slate-700 border-slate-200 hover:border-blue-400 hover:text-blue-700 hover:bg-white",
                  ].join(" ")
                }
              >
                {label}
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
