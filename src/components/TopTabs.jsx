// src/components/TopTabs.jsx
import React, { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * TopTabs — v8 (FORCE NAV)
 * - Admin tab usa <a href="/admins"> + window.location.assign("/admins") en onPointerDown
 * - Fuerza z-index y pointer-events para evitar overlays/scroll containers que tragan clicks
 * - Mantiene NavLink para el resto
 * - Marca tabs:v8 para confirmar prod
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

function humanize(s) {
  return String(s || "")
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
    return humanize(key.replace(/^(app\.)?(tabs|menu|nav)\./i, ""));
  }
  return safeText(tab?.label).trim() || fallbackFromPath(tab?.path);
}

export default function TopTabs({ tabs = [] }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, currentRole, isAppRoot } = useAuth();

  const roleRaw = safeText(currentRole).trim().toLowerCase();
  const roleLabel = isAppRoot ? "ROOT" : roleRaw ? roleRaw.toUpperCase() : "SIN ROL";

  const canSeeAdmin = !!user && (isAppRoot || roleRaw === "owner" || roleRaw === "admin");

  const items = useMemo(() => {
    const base = Array.isArray(tabs) ? [...tabs] : [];
    if (canSeeAdmin && !base.some((x) => safeText(x?.path).trim() === "/admins")) {
      base.push({ path: "/admins", label: "Administrador", __forceHardNav: true });
    }
    return base;
  }, [tabs, canSeeAdmin]);

  const isActive = (path) => {
    const p = safeText(path).trim();
    if (!p) return false;
    return location.pathname === p || location.pathname.startsWith(p + "/");
  };

  const baseCls =
    "inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-semibold " +
    "border transition-colors whitespace-nowrap min-w-[92px] select-none";

  return (
    <div className="w-full relative z-[9999]" data-top-tabs="v8">
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm relative z-[9999]">
        <div className="flex items-center gap-3 relative z-[9999]">
          {/* Org selector (izq) */}
          <div className="shrink-0 relative z-[9999]">
            <OrgSelector />
          </div>

          {/* Tabs */}
          <div
            className="flex-1 overflow-x-auto relative z-[9999]"
            style={{ pointerEvents: "auto" }}
          >
            <div className="flex gap-2 min-w-max relative z-[9999]" style={{ pointerEvents: "auto" }}>
              {items.map((tab, idx) => {
                const path = safeText(tab?.path).trim();
                if (!path) return null;

                const active = isActive(path);
                const label = resolveLabel(t, tab);

                const style = active
                  ? { background: "#0f172a", color: "#ffffff" }
                  : { background: "#ffffff", color: "#0f172a" };

                const cls = `${baseCls} ${
                  active ? "border-slate-900 shadow-sm" : "border-slate-300 hover:bg-slate-50"
                }`;

                // ✅ ADMINISTRADOR: navegación dura (no depende de React Router)
                if (tab.__forceHardNav) {
                  return (
                    <a
                      key={`hard-${path}-${idx}`}
                      href="/admins"
                      className={cls}
                      style={{ ...style, pointerEvents: "auto", position: "relative", zIndex: 9999 }}
                      title={label}
                      onPointerDown={(e) => {
                        // se dispara antes que click (mejor para casos de scroll/overlays)
                        e.stopPropagation();
                        // navegación dura, no puede “no reaccionar”
                        window.location.assign("/admins");
                      }}
                      onClick={(e) => {
                        // por si pointerdown no aplica (algunos entornos)
                        e.preventDefault();
                        e.stopPropagation();
                        window.location.assign("/admins");
                      }}
                    >
                      {label}
                    </a>
                  );
                }

                // Resto: NavLink normal
                return (
                  <NavLink
                    key={path || `tab-${idx}`}
                    to={path}
                    className={cls}
                    style={{ ...style, pointerEvents: "auto", position: "relative", zIndex: 9999 }}
                    title={label}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {label}
                  </NavLink>
                );
              })}
            </div>
          </div>

          {/* Email + rol */}
          {user && (
            <div className="hidden md:flex flex-col text-right text-xs px-2 py-1 rounded bg-slate-100 relative z-[9999]">
              <span className="font-medium text-slate-800">{user.email ?? "Sin email"}</span>
              <span className="text-slate-600">{roleLabel}</span>
            </div>
          )}

          {/* Marca de versión */}
          <div className="ml-2 text-[10px] text-slate-400 select-none relative z-[9999]">
            tabs:v8
          </div>
        </div>
      </div>
    </div>
  );
}
