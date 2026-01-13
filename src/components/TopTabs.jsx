// src/components/TopTabs.jsx
import React, { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * TopTabs — v6
 * - Email + rol visibles
 * - Inyecta tab Administrador a /admins (ruta real)
 * - Marca tabs:v6 para confirmar prod
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

    const cleaned = key.replace(/^(app\.)?(tabs|menu|nav)\./i, "");
    const hk = humanize(cleaned).trim();
    if (hk) return hk;
  }

  const direct = safeText(tab?.label).trim();
  if (direct) return direct;

  return fallbackFromPath(tab?.path);
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

  const roleRaw = safeText(currentRole).trim().toLowerCase();
  const roleLabel = isAppRoot ? "ROOT" : roleRaw ? roleRaw.toUpperCase() : "SIN ROL";

  const canSeeAdmin = !!user && (isAppRoot || roleRaw === "owner" || roleRaw === "admin");

  const items = useMemo(() => {
    const base = Array.isArray(tabs) ? [...tabs] : [];
    if (canSeeAdmin) {
      const exists = base.some((x) => safeText(x?.path).trim() === "/admins");
      if (!exists) base.push({ path: "/admins", label: "Administrador" });
    }
    return base;
  }, [tabs, canSeeAdmin]);

  const isActive = (path) => {
    const p = safeText(path).trim();
    if (!p) return false;
    return location.pathname === p || location.pathname.startsWith(p + "/");
  };

  const baseCls =
    "no-underline inline-flex items-center justify-center px-4 py-2 rounded-md text-sm " +
    "font-semibold border transition-colors whitespace-nowrap min-w-[92px]";

  const activeCls = "shadow-sm border-slate-900";
  const inactiveCls = "border-slate-300 hover:bg-slate-50 hover:border-slate-400";

  return (
    <div className="w-full" data-top-tabs="v6">
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

                const style = on
                  ? { background: "#0f172a", color: "#ffffff" }
                  : { background: "#ffffff", color: "#0f172a" };

                return (
                  <NavLink
                    key={path || `tab-${idx}`}
                    to={path}
                    className={`${baseCls} ${on ? activeCls : inactiveCls}`}
                    style={style}
                    title={label}
                  >
                    {label}
                  </NavLink>
                );
              })}
            </div>
          </nav>

          {user && (
            <div className="hidden md:flex flex-col text-right text-xs px-2 py-1 rounded bg-slate-100">
              <span className="font-medium text-slate-800">{user.email ?? "Sin email"}</span>
              <span className="text-slate-600">{roleLabel}</span>
            </div>
          )}

          <div className="ml-2 text-[10px] text-slate-400 select-none">tabs:v6</div>
        </div>
      </div>
    </div>
  );
}
