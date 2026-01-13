// src/components/TopTabs.jsx
import React, { useMemo } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OrgSelector from "./OrgSelector";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * TopTabs — v7 (FIX DEFINITIVO)
 * - ADMINISTRADOR navega por useNavigate (no NavLink)
 * - Evita bugs de overflow-x / scroll container
 * - Mantiene NavLink para el resto
 * - Marca tabs:v7 para confirmar prod
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
  const navigate = useNavigate();
  const { user, currentRole, isAppRoot } = useAuth();

  const roleRaw = safeText(currentRole).toLowerCase();
  const roleLabel = isAppRoot ? "ROOT" : roleRaw ? roleRaw.toUpperCase() : "SIN ROL";
  const canSeeAdmin = !!user && (isAppRoot || roleRaw === "owner" || roleRaw === "admin");

  const items = useMemo(() => {
    const base = Array.isArray(tabs) ? [...tabs] : [];
    if (canSeeAdmin && !base.some((x) => x?.path === "/admins")) {
      base.push({ path: "/admins", label: "Administrador", __forceNav: true });
    }
    return base;
  }, [tabs, canSeeAdmin]);

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const baseCls =
    "inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-semibold " +
    "border transition-colors whitespace-nowrap min-w-[92px] cursor-pointer";

  return (
    <div className="w-full" data-top-tabs="v7">
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
        <div className="flex items-center gap-3">
          <OrgSelector />

          {/* ---------- TABS ---------- */}
          <div
            className="flex-1 overflow-x-auto"
            style={{ pointerEvents: "auto" }}
          >
            <div className="flex gap-2 min-w-max">
              {items.map((tab, idx) => {
                const path = safeText(tab?.path);
                const label = resolveLabel(t, tab);
                const active = isActive(path);

                const style = active
                  ? { background: "#0f172a", color: "#fff" }
                  : { background: "#fff", color: "#0f172a" };

                // 🔒 ADMINISTRADOR → navegación programática
                if (tab.__forceNav) {
                  return (
                    <div
                      key={`admin-${idx}`}
                      onClick={() => {
                        console.log("[TopTabs] navigate -> /admins");
                        navigate("/admins");
                      }}
                      className={`${baseCls} border-slate-300 hover:bg-slate-50 ${
                        active ? "border-slate-900 shadow-sm" : ""
                      }`}
                      style={style}
                      role="button"
                      tabIndex={0}
                    >
                      {label}
                    </div>
                  );
                }

                // Resto de tabs → NavLink normal
                return (
                  <NavLink
                    key={path || idx}
                    to={path}
                    className={`${baseCls} ${
                      active
                        ? "border-slate-900 shadow-sm"
                        : "border-slate-300 hover:bg-slate-50"
                    }`}
                    style={style}
                  >
                    {label}
                  </NavLink>
                );
              })}
            </div>
          </div>

          {/* ---------- CONTEXTO ---------- */}
          {user && (
            <div className="hidden md:flex flex-col text-right text-xs px-2 py-1 rounded bg-slate-100">
              <span className="font-medium text-slate-800">{user.email}</span>
              <span className="text-slate-600">{roleLabel}</span>
            </div>
          )}

          <div className="ml-2 text-[10px] text-slate-400 select-none">tabs:v7</div>
        </div>
      </div>
    </div>
  );
}
