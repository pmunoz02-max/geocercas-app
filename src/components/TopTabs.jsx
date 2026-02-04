// src/components/TopTabs.jsx
import React, { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";
import { useAuth } from "../context/AuthContext.jsx";

function cx(...arr) {
  return arr.filter(Boolean).join(" ");
}

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

function fallbackFromPath(path) {
  const p = String(path || "").split("/").filter(Boolean).pop() || "";
  return humanize(p) || "Tab";
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

  return fallbackFromPath(tab?.path);
}

function uniqByPath(tabs) {
  const seen = new Set();
  const out = [];
  for (const it of tabs || []) {
    const p = safeText(it?.path).trim();
    if (!p) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(it);
  }
  return out;
}

export default function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, currentRole, role, isAppRoot } = useAuth();

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

  const baseItems = Array.isArray(tabs) ? tabs : [];

  const items = useMemo(() => {
    const injected = [...baseItems];
    if (isAppRoot) {
      injected.push({ path: "/admins", labelKey: "app.tabs.admins", label: "Administradores" });
    }
    return uniqByPath(injected);
  }, [baseItems, isAppRoot]);

  const effectiveRole = safeText(currentRole || role).trim();
  const roleRaw = effectiveRole.toLowerCase();
  const roleLabel = isAppRoot ? "ROOT" : roleRaw ? roleRaw.toUpperCase() : "…";

  const isOnPath = (to) => {
    const p = safeText(to).trim();
    if (!p) return false;
    return location.pathname === p || location.pathname.startsWith(p + "/");
  };

  const tabBase =
    "no-underline inline-flex items-center justify-center select-none " +
    "px-5 py-2.5 rounded-full text-sm font-extrabold whitespace-nowrap " +
    "transition-all duration-150 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60";

  // ✅ IMPORTANT: forzamos color con !
  const tabInactive =
    "bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm " +
    "!text-slate-900";

  const tabActive =
    "border border-emerald-600 shadow-md bg-gradient-to-r from-emerald-600 via-emerald-500 to-cyan-600 " +
    "!text-white";

  return (
    <div className="w-full" data-top-tabs="v14">
      <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2 shadow-sm">
        <div className="flex items-center gap-3">
          {!flags.noorg ? (
            <div className="shrink-0">
              <OrgSelector />
            </div>
          ) : null}

          <nav className="flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex gap-3 min-w-max py-1">
              {items.map((tab, idx) => {
                const to = safeText(tab?.path).trim();
                if (!to) return null;

                const label = safeText(resolveLabel(t, tab)).trim() || fallbackFromPath(to);
                const on = isOnPath(to);

                return (
                  <NavLink
                    key={to || `tab-${idx}`}
                    to={to}
                    title={label}
                    className={({ isActive }) =>
                      cx(tabBase, (on || isActive) ? tabActive : tabInactive)
                    }
                  >
                    {/* ✅ doble-blindaje: el span también fuerza color */}
                    <span className={(on ? "!text-white" : "!text-slate-900")}>{label}</span>
                  </NavLink>
                );
              })}
            </div>
          </nav>

          {user ? (
            <div className="hidden md:flex items-center gap-2 text-xs px-3 py-2 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 truncate max-w-[220px]">
                  {user.email ?? "Sin email"}
                </div>
                <div className="text-[10px] font-extrabold tracking-wider text-slate-500">
                  {roleLabel}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
