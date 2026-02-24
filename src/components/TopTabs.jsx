// src/components/TopTabs.jsx
import React, { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";
import { useAuth } from "@/context/auth.js";

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

function humanize(s) {
  const str = String(s || "").trim();
  if (!str) return "";
  return str
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function fallbackFromPath(path, t) {
  const p = String(path || "").split("/").filter(Boolean).pop() || "";
  const h = humanize(p);
  return h || t("common.actions.loading", { defaultValue: "Tab" }); // fallback neutro
}

function resolveLabel(t, tab) {
  const key = safeText(tab?.labelKey).trim();
  if (key) {
    const translated = t(key, { defaultValue: "" });
    const s = safeText(translated).trim();
    if (s && s !== key) return s;

    const cleaned = key.replace(/^(app\.)?(tabs|menu|nav)\./i, "");
    const hk = humanize(cleaned).trim();
    if (hk) return hk;
  }

  const direct = safeText(tab?.label).trim();
  if (direct) return direct;

  return "";
}

export default function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, currentRole, isAppRoot } = useAuth();

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

  const roleRaw = safeText(currentRole).trim().toLowerCase();
  const roleLabel = isAppRoot
    ? t("common.roles.root")
    : roleRaw
    ? roleRaw.toUpperCase()
    : t("common.roles.noRole");

  const isActive = (path) => {
    const p = safeText(path).trim();
    if (!p) return false;
    return location.pathname === p || location.pathname.startsWith(p + "/");
  };

  const wrapCls = "w-full text-slate-900";
  const panelCls =
    "bg-white border border-slate-200 rounded-2xl px-3 py-2 shadow-sm text-slate-900";

  const baseCls =
    "no-underline inline-flex items-center justify-center px-4 py-2 rounded-full " +
    "text-sm font-semibold whitespace-nowrap border transition-all duration-150 " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-white";

  const activeCls = "bg-slate-900 border-slate-900 !text-white shadow-sm";

  const inactiveCls =
    "bg-white border-slate-200 !text-slate-900 " +
    "hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm";

  return (
    <div className={wrapCls} data-top-tabs="v11">
      <div className={panelCls}>
        <div className="flex items-center gap-3">
          {!flags.noorg ? (
            <div className="shrink-0">
              <OrgSelector />
            </div>
          ) : null}

          <nav className="flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 min-w-max items-center">
              {items.map((tab, idx) => {
                const path = safeText(tab?.path).trim();
                if (!path) return null;

                const on = isActive(path);
                const labelResolved = safeText(resolveLabel(t, tab)).trim();
                const label = labelResolved || fallbackFromPath(path, t);

                return (
                  <NavLink
                    key={path || `tab-${idx}`}
                    to={path}
                    title={label}
                    className={`${baseCls} ${on ? activeCls : inactiveCls}`}
                  >
                    <span className="relative">
                      {label}
                      {on ? (
                        <span className="absolute left-0 -bottom-1 h-[2px] w-full rounded-full bg-emerald-400/80" />
                      ) : null}
                    </span>
                  </NavLink>
                );
              })}
            </div>
          </nav>

          {user && (
            <div className="hidden md:flex flex-col text-right text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-medium text-slate-900">
                {user.email ?? t("common.fallbacks.noEmail")}
              </span>
              <span className="text-slate-600">{roleLabel}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

