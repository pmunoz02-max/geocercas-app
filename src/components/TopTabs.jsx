// src/components/TopTabs.jsx
import React, { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";

/**
 * TopTabs — FIX v3 (forzar texto visible + marca de versión)
 *
 * Qué arregla:
 * - Si por cualquier razón el label llega vacío (i18n/key), SIEMPRE cae a fallback por ruta.
 * - Fuerza color de texto por inline-style para evitar CSS externo que lo vuelva transparente.
 * - Incluye una marca discreta "tabs:v3" para confirmar que este archivo está cargado en producción.
 */

function safeText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    try {
      return String(v);
    } catch {
      return "";
    }
  }
}

function humanize(s) {
  const str = String(s || "").trim();
  if (!str) return "";
  return str
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function fallbackFromPath(path) {
  const p = String(path || "").split("/").filter(Boolean).pop() || "";
  return humanize(p) || "Tab";
}

function resolveLabel(t, tab) {
  const key = safeText(tab?.labelKey).trim();
  if (key) {
    const translated = t(key, { defaultValue: "" });
    const s = safeText(translated).trim();
    if (s && s !== key && s !== "{}" && s !== "[]") return s;

    // si i18n devuelve el key, humanizamos el key (quita prefijos)
    const cleaned = key.replace(/^(app\.)?(tabs|menu|nav)\./i, "");
    const hk = humanize(cleaned).trim();
    if (hk) return hk;
  }

  // label directo
  const direct = safeText(tab?.label).trim();
  if (direct) return direct;

  // fallback final
  return fallbackFromPath(tab?.path);
}

export default function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();

  const flags = useMemo(() => {
    try {
      const params = new URLSearchParams(location.search || "");
      return { notabs: params.get("notabs") === "1", noorg: params.get("noorg") === "1" };
    } catch {
      return { notabs: false, noorg: false };
    }
  }, [location.search]);

  if (flags.notabs) return null;

  const items = Array.isArray(tabs) ? tabs : [];

  const isActive = (path) => {
    const p = safeText(path).trim();
    if (!p) return false;
    return location.pathname === p || location.pathname.startsWith(p + "/");
  };

  const base =
    "no-underline inline-flex items-center justify-center px-4 py-2 rounded-md text-sm " +
    "font-semibold border transition-colors whitespace-nowrap min-w-[92px]";

  // (clases de layout; colores se fuerzan por style)
  const activeCls = "shadow-sm border-slate-900";
  const inactiveCls = "border-slate-300 hover:bg-slate-50 hover:border-slate-400";

  return (
    <div className="w-full" data-top-tabs="v3">
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
                const path = safeText(tab?.path).trim();
                if (!path) return null;

                const on = isActive(path);
                const label = safeText(resolveLabel(t, tab)).trim() || fallbackFromPath(path);

                // Fuerza visibilidad incluso si hay CSS externo raro
                const style = on
                  ? { background: "#0f172a", color: "#ffffff" } // slate-900
                  : { background: "#ffffff", color: "#0f172a" }; // slate-900

                return (
                  <NavLink
                    key={path || `tab-${idx}`}
                    to={path}
                    className={`${base} ${on ? activeCls : inactiveCls}`}
                    style={style}
                    title={label}
                  >
                    {label}
                  </NavLink>
                );
              })}
            </div>
          </nav>

          {/* Marca discreta para confirmar versión */}
          <div className="ml-2 text-[10px] text-slate-400 select-none">tabs:v3</div>
        </div>
      </div>
    </div>
  );
}
