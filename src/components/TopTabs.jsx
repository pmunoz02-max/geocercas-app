// src/components/TopTabs.jsx
import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";

/** =========================
 * Helpers (a prueba de i18n)
 * ========================= */
function safeText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function humanizeKey(key) {
  const raw = String(key || "").trim();
  if (!raw) return "";
  const last = raw.split(".").pop() || raw;
  // camelCase / snake_case / kebab-case -> "Title Case"
  const spaced = last
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : last;
}

/** Devuelve SIEMPRE un string visible */
function getTabLabel(t, tab) {
  // 1) Si viene label explícito, úsalo
  if (typeof tab?.label === "string" && tab.label.trim()) return tab.label.trim();

  // 2) Si viene labelKey, intenta traducir, pero con fallback robusto
  const key = tab?.labelKey ? String(tab.labelKey) : "";
  if (key) {
    // defaultValue hace que i18next NO devuelva null
    const translated = t(key, { defaultValue: key });

    // Si es string y no es vacío, úsalo
    if (typeof translated === "string" && translated.trim()) return translated.trim();

    // Si devolvió objeto (returnObjects) o string vacío, humaniza la key
    return humanizeKey(key);
  }

  // 3) Último recurso
  return "Tab";
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

        {/* IMPORTANTE:
            - overflow-x-auto evita que se “rompa” la línea en pantallas pequeñas
            - gap + pb para mantener estética */}
        <nav className="flex gap-1.5 pb-2 justify-center overflow-x-auto scrollbar-thin">
          {Array.isArray(tabs) && tabs.length ? (
            tabs.map((tab) => {
              const label = getTabLabel(t, tab);
              const activeTab = isActive(tab.path);

              return (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  className={`${base} ${activeTab ? active : inactive}`}
                  title={safeText(label)}
                >
                  {safeText(label)}
                </NavLink>
              );
            })
          ) : (
            <span className="text-xs text-slate-500 py-2">
              {safeText(t("app.tabs.empty", { defaultValue: "Sin pestañas" }))}
            </span>
          )}
        </nav>
      </div>
    </div>
  );
}