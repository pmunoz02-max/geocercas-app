// src/components/TopTabs.jsx
import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";

/**
 * TopTabs – COMPACT (a prueba de i18n)
 * - Todos los botones estilo "Invitar tracker"
 * - Tamaño reducido
 * - Sin scroll horizontal (como lo tenías)
 * - Si una traducción devuelve "" u objeto, se usa un fallback visible.
 */

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
  const spaced = last
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : last;
}

function getTabLabel(t, tab) {
  // 1) label explícito
  if (typeof tab?.label === "string" && tab.label.trim()) return tab.label.trim();

  // 2) labelKey con fallback
  const key = tab?.labelKey ? String(tab.labelKey) : "";
  if (key) {
    // defaultValue evita null, pero puede seguir devolviendo ""
    const translated = t(key, { defaultValue: "" });

    if (typeof translated === "string") {
      const trimmed = translated.trim();
      if (trimmed) return trimmed;
      return humanizeKey(key);
    }

    // Si es objeto u otro tipo
    const asString = safeText(translated).trim();
    return asString ? asString : humanizeKey(key);
  }

  // 3) último recurso: del path
  const p = String(tab?.path || "").split("/").filter(Boolean).pop() || "Tab";
  return humanizeKey(p);
}

export default function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const base =
    "no-underline inline-flex items-center " +
    "px-3 py-1.5 rounded-full " +
    "text-xs sm:text-sm font-semibold " +
    "whitespace-nowrap border " +
    "transition-all duration-150 " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2";

  const inactive =
    "bg-white text-emerald-700 border-emerald-500 " +
    "hover:bg-emerald-50 hover:text-emerald-800";

  const active = "bg-emerald-600 text-white border-emerald-600 shadow-sm";

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        <div className="flex justify-end py-2">
          <OrgSelector />
        </div>

        <nav className="flex gap-2 pb-3 justify-center flex-wrap">
          {tabs.map((tab) => {
            const label = getTabLabel(t, tab);
            const activeTab = isActive(tab.path);

            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={`${base} ${activeTab ? active : inactive}`}
                style={
                  activeTab
                    ? { backgroundColor: "#059669", borderColor: "#059669", color: "#fff" }
                    : { backgroundColor: "#fff", borderColor: "#10b981", color: "#047857" }
                }
                title={safeText(label)}
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
