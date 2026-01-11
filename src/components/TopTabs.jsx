// src/components/TopTabs.jsx
import React, { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";

/**
 * TopTabs — FIX v2 (tabs visibles SIEMPRE)
 *
 * Síntoma reportado:
 * - Se ven los "cuadros" de tabs pero SIN texto (en blanco), excepto la tab activa.
 *
 * Causa típica:
 * - i18n devuelve "" o valores raros; safeText("") no cae a fallback.
 *
 * Solución:
 * - Si el label resultante es vacío/espacios, forzar fallback humano por path o por key.
 * - Mantener estilos con contraste alto.
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
  // 1) label directo
  if (typeof tab?.label === "string") {
    const s = tab.label.trim();
    if (s) return s;
  }

  // 2) labelKey
  const key = safeText(tab?.labelKey, "").trim();
  if (key) {
    const translated = t(key, { defaultValue: "" });
    const s = safeText(translated, "").trim();

    // Si i18n devuelve algo útil
    if (s && s !== key && s !== "{}" && s !== "[]") return s;

    // Si i18n devuelve el MISMO key o vacío -> humanize
    const hk = humanizeKey(key).trim();
    if (hk) return hk;
  }

  // 3) fallback por ruta
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
    const p = safeText(path, "").trim();
    if (!p) return false;
    return location.pathname === p || location.pathname.startsWith(p + "/");
  };

  const base =
    "no-underline inline-flex items-center justify-center px-4 py-2 rounded-md text-sm " +
    "font-semibold border transition-colors whitespace-nowrap min-w-[88px]";

  const active = "bg-slate-900 text-white border-slate-900 shadow-sm";
  const inactive = "bg-white text-slate-800 border-slate-300 hover:bg-slate-50 hover:border-slate-400";

  return (
    <div className="w-full">
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

                const on = isActive(path);

                // 🔥 FIX CRÍTICO: si label queda vacío, SIEMPRE fallback
                const rawLabel = resolveLabel(t, tab);
                const label = safeText(rawLabel, "").trim() || fallbackFromPath(path);

                return (
                  <NavLink
                    key={path || `tab-${idx}`}
                    to={path}
                    className={`${base} ${on ? active : inactive}`}
                    title={label}
                  >
                    {label}
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
