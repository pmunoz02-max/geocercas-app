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
  if (typeof tab?.label === "string") {
    const s = tab.label.trim();
    if (s) return s;
  }

  const key = tab?.labelKey ? String(tab.labelKey).trim() : "";
  if (key) {
    const translated = t(key, { defaultValue: "" });

    if (typeof translated === "string") {
      const s = translated.trim();
      if (s) return s;
      return humanizeKey(key) || fallbackFromPath(tab?.path);
    }

    const s = safeText(translated).trim();
    if (s && s !== "{}" && s !== "[]") return s;
    return humanizeKey(key) || fallbackFromPath(tab?.path);
  }

  return fallbackFromPath(tab?.path);
}

class LocalBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, msg: "" };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, msg: safeText(err?.message || err) };
  }
  componentDidCatch(err) {
    console.error("[TopTabs] LocalBoundary:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full px-3 py-2">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-2 text-xs">
            Error en TopTabs (aislado): {safeText(this.state.msg)}
          </div>
        </div>
      );
    }
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
    "no-underline inline-flex items-center px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold " +
    "whitespace-nowrap border transition-all duration-150 focus:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-emerald-500 focus-visible:ring-offset-2";

  const inactive =
    "bg-white text-emerald-700 border-emerald-500 hover:bg-emerald-50 hover:text-emerald-800";

  const active = "bg-emerald-600 text-white border-emerald-600 shadow-sm";

  const computed = useMemo(() => {
    const list = Array.isArray(tabs) ? tabs : [];
    return list.map((tab) => ({ ...tab, __label: getTabLabel(t, tab) }));
  }, [tabs, t]);

  if (flags.debugTabs) {
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
    <LocalBoundary>
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-4">
          {!flags.noorg && (
            <LocalBoundary>
              <div className="flex justify-end py-2">
                <OrgSelector />
              </div>
            </LocalBoundary>
          )}

          <nav className="flex gap-2 pb-3 justify-center flex-wrap">
            {computed.map((tab) => {
              const activeTab = isActive(tab.path);
              const label = safeText(tab.__label).trim() || fallbackFromPath(tab.path);

              return (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  className={`${base} ${activeTab ? active : inactive}`}
                >
                  {label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </div>
    </LocalBoundary>
  );
}
