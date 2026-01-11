import React, { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";

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

function humanizeKey(key) {
  const s = String(key || "").trim();
  if (!s) return "";
  // Quita prefijos comunes: tabs., menu., nav.
  const cleaned = s.replace(/^(tabs|menu|nav)\./i, "");
  // Separa por puntos/guiones/underscores y capitaliza
  const parts = cleaned.split(/[._-]+/).filter(Boolean);
  if (!parts.length) return cleaned;
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function fallbackFromPath(path) {
  const p = String(path || "").split("/").filter(Boolean).pop() || "";
  return humanizeKey(p) || "Tab";
}

function getTabLabel(t, tab) {
  // 1) label directo
  if (typeof tab?.label === "string") {
    const s = tab.label.trim();
    if (s) return s;
  }

  // 2) labelKey via i18n
  const key = tab?.labelKey ? String(tab.labelKey).trim() : "";
  if (key) {
    // defaultValue="" para no forzar key
    const translated = t(key, { defaultValue: "" });

    if (typeof translated === "string") {
      const s = translated.trim();

      // Si i18n devuelve vacío => fallback humano
      if (!s) return humanizeKey(key) || fallbackFromPath(tab?.path);

      // Si i18n devuelve el MISMO key => lo consideramos "no traducido"
      if (s === key) return humanizeKey(key) || fallbackFromPath(tab?.path);

      // Si devuelve algo tipo "{}" o "[]" => fallback humano
      if (s === "{}" || s === "[]") return humanizeKey(key) || fallbackFromPath(tab?.path);

      return s;
    }

    const s = safeText(translated).trim();
    if (s && s !== "{}" && s !== "[]") {
      if (s === key) return humanizeKey(key) || fallbackFromPath(tab?.path);
      return s;
    }

    return humanizeKey(key) || fallbackFromPath(tab?.path);
  }

  // 3) fallback por ruta
  return fallbackFromPath(tab?.path);
}

class LocalBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err) {
    // eslint-disable-next-line no-console
    console.error("[TopTabs] render error:", err);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
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
        debugTabs: params.get("debugTabs") === "1",
      };
    } catch {
      return { notabs: false, noorg: false, debugTabs: false };
    }
  }, [location.search]);

  if (flags.notabs) return null;

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const base =
    "no-underline inline-flex items-center px-3 py-2 rounded-full text-xs sm:text-sm font-semibold " +
    "whitespace-nowrap border transition-colors duration-150 focus:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-emerald-500 focus-visible:ring-offset-2";

  // Más visibles (antes podían verse “apagadas”)
  const active =
    "bg-slate-900 text-white border-slate-900 shadow-sm";
  const inactive =
    "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400";

  const safeTabs = Array.isArray(tabs) ? tabs : [];

  return (
    <LocalBoundary>
      <div className="w-full">
        {/* Barra clara y visible */}
        <div className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
          <div className="flex items-center gap-3">
            {/* Selector org a la izquierda */}
            {!flags.noorg ? (
              <div className="shrink-0">
                <OrgSelector />
              </div>
            ) : null}

            {/* Tabs con scroll horizontal */}
            <nav className="flex-1 overflow-x-auto">
              <div className="flex gap-2 min-w-max">
                {safeTabs.map((tab, idx) => {
                  const path = safeText(tab?.path).trim();
                  if (!path) return null;

                  const label = getTabLabel(t, tab);
                  const activeTab = isActive(path);

                  return (
                    <NavLink
                      key={path || `tab-${idx}`}
                      to={path}
                      className={`${base} ${activeTab ? active : inactive}`}
                      title={label}
                    >
                      {safeText(label) || fallbackFromPath(path)}
                    </NavLink>
                  );
                })}
              </div>
            </nav>
          </div>

          {/* Debug opcional */}
          {flags.debugTabs ? (
            <pre className="mt-2 text-[10px] bg-slate-50 border border-slate-200 rounded p-2 overflow-auto">
              {safeText(safeTabs)}
            </pre>
          ) : null}
        </div>
      </div>
    </LocalBoundary>
  );
}
