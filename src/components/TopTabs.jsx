// src/components/TopTabs.jsx
import React, { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";

/**
 * TopTabs — FIX visual + anti React #300
 *
 * Problema:
 * - Tabs quedaron "invisibles" por estilo/contraste.
 * - En algunos casos i18n devuelve la key literal; aquí caemos a un label humano.
 *
 * Garantías:
 * - Nunca renderiza objetos crudos en JSX.
 * - Tabs siempre visibles (fondo + borde + contraste).
 * - Soporta overflow horizontal en móvil.
 */

function safeText(v, fallback = "") {
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    if (s === "{}" || s === "[]") return fallback;
    return s;
  } catch {
    try {
      return String(v);
    } catch {
      return fallback;
    }
  }
}

function humanizeKey(key) {
  const s = String(key || "").trim();
  if (!s) return "";
  // Quita prefijos comunes
  const cleaned = s.replace(/^(app\.)?(tabs|menu|nav)\./i, "");
  const parts = cleaned.split(/[._-]+/).filter(Boolean);
  if (!parts.length) return cleaned;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function fallbackFromPath(path) {
  const p = String(path || "").split("/").filter(Boolean).pop() || "";
  return humanizeKey(p) || "Tab";
}

function resolveLabel(t, tab) {
  // label directo (si alguien lo pasa)
  if (typeof tab?.label === "string" && tab.label.trim()) return tab.label.trim();

  const key = safeText(tab?.labelKey, "").trim();
  if (!key) return fallbackFromPath(tab?.path);

  // 1) intenta la key tal cual (ej: app.tabs.inicio)
  const a = t(key, { defaultValue: "" });
  const aStr = safeText(a, "").trim();

  // si i18n devuelve vacío o la misma key, consideramos "no traducido"
  if (aStr && aStr !== key && aStr !== "{}" && aStr !== "[]") return aStr;

  // 2) fallback: si alguien pasó "tabs.dashboard" sin "app."
  if (!key.startsWith("app.") && (key.startsWith("tabs.") || key.includes(".tabs."))) {
    const bKey = `app.${key}`;
    const b = t(bKey, { defaultValue: "" });
    const bStr = safeText(b, "").trim();
    if (bStr && bStr !== bKey && bStr !== "{}" && bStr !== "[]") return bStr;
  }

  // 3) fallback humano
  return humanizeKey(key) || fallbackFromPath(tab?.path);
}

export default function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();

  const flags = useMemo(() => {
    try {
      const params = new URLSearchParams(location.search || "");
      return {
        notabs: params.get("notabs") === "1",
        noorg: params.get("noorg") === "1",
      };
    } catch {
      return { notabs: false, noorg: false };
    }
  }, [location.search]);

  if (flags.notabs) return null;

  const items = Array.isArray(tabs) ? tabs : [];

  const isActive = (path) => {
    const p = safeText(path, "").trim();
    if (!p) return false;
    return location.pathname === p || location.pathname.startsWith(p + "/");
  };

  const base =
    "no-underline inline-flex items-center px-3 py-1.5 rounded-md text-xs sm:text-sm " +
    "font-semibold border transition-colors whitespace-nowrap";

  const active = "bg-slate-900 text-white border-slate-900 shadow-sm";
  const inactive = "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400";

  return (
    <div className="w-full">
      {/* Barra visible */}
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
        <div className="flex items-center gap-3">
          {!flags.noorg ? (
            <div className="shrink-0">
              <OrgSelector />
            </div>
          ) : null}

          <nav className="flex-1 overflow-x-auto">
            <div className="flex gap-2 min-w-max">
              {items.map((tab, idx) => {
                const path = safeText(tab?.path, "").trim();
                if (!path) return null;

                const label = resolveLabel(t, tab);
                const on = isActive(path);

                return (
                  <NavLink
                    key={path || `tab-${idx}`}
                    to={path}
                    className={`${base} ${on ? active : inactive}`}
                    title={safeText(label, "Tab")}
                  >
                    {safeText(label, fallbackFromPath(path))}
                  </NavLink>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
