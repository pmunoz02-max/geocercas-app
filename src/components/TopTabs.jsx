// src/components/TopTabs.jsx
import React, { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";

/**
 * TopTabs (FINAL – robusto)
 * Objetivo:
 * - Nunca renderizar labels vacíos (ni romper por i18n)
 * - Mantener estilo compacto (píldoras)
 * - Debug opcional para ver qué label llega realmente
 *
 * Debug:
 * - Agrega ?debugTabs=1 a la URL para ver en consola los labels calculados
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

function fallbackFromPath(path) {
  const p = String(path || "").split("/").filter(Boolean).pop() || "";
  return humanizeKey(p) || "Tab";
}

function getTabLabel(t, tab) {
  // 1) label explícito
  if (typeof tab?.label === "string") {
    const s = tab.label.trim();
    if (s) return s;
  }

  // 2) i18n labelKey
  const key = tab?.labelKey ? String(tab.labelKey).trim() : "";
  if (key) {
    // NOTA: defaultValue="" evita que muestre la key literal si no existe
    // y nos permite controlar el fallback nosotros.
    const translated = t(key, { defaultValue: "" });

    if (typeof translated === "string") {
      const s = translated.trim();
      if (s) return s;

      // Si la traducción existe pero quedó vacía, humanizamos la key.
      const hk = humanizeKey(key);
      if (hk) return hk;
    } else {
      // Si i18n devuelve objeto (returnObjects), lo convertimos a string o fallback.
      const s = safeText(translated).trim();
      if (s && s !== "{}" && s !== "[]") return s;

      const hk = humanizeKey(key);
      if (hk) return hk;
    }
  }

  // 3) fallback final basado en path
  return fallbackFromPath(tab?.path);
}

export default function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();

  const debugTabs = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("debugTabs") === "1";
    } catch {
      return false;
    }
  }, []);

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

  const computed = useMemo(() => {
    const list = Array.isArray(tabs) ? tabs : [];
    return list.map((tab) => ({
      ...tab,
      __label: getTabLabel(t, tab),
    }));
  }, [tabs, t]);

  if (debugTabs) {
    // Log una sola vez por render
    console.log("[TopTabs debug] tabs raw:", tabs);
    console.table(
      computed.map((x) => ({
        path: x.path,
        labelKey: x.labelKey,
        label: x.label,
        computedLabel: x.__label,
      }))
    );
  }

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        <div className="flex justify-end py-2">
          <OrgSelector />
        </div>

        <nav className="flex gap-2 pb-3 justify-center flex-wrap">
          {computed.map((tab) => {
            const activeTab = isActive(tab.path);
            const label = safeText(tab.__label).trim() || fallbackFromPath(tab.path);

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
                title={label}
              >
                {label}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}