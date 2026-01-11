import React, { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * TopTabs — FIX React #300
 * Nunca renderizar objetos en JSX (ej: label).
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

export default function TopTabs() {
  const location = useLocation();
  const { t } = useTranslation();
  const { currentRole, currentOrg, isRootOwner } = useAuth();

  const base = useMemo(() => {
    // si tienes base por rol, déjalo como ya lo tenías; aquí solo lo normalizo
    return "";
  }, []);

  const tabs = useMemo(() => {
    // Mantén tu lista real de tabs (yo no invento módulos).
    // Solo aseguro que label sea string seguro.
    const raw = [
      // EJEMPLO: reemplaza por tu lista real si difiere
      { path: "/dashboard", key: "tabs.dashboard", show: true },
      { path: "/geocercas", key: "tabs.geocercas", show: true },
      { path: "/personal", key: "tabs.personal", show: true },
      { path: "/admins", key: "tabs.admins", show: Boolean(isRootOwner) },
    ];

    return raw
      .filter((x) => x.show)
      .map((x) => ({
        path: safeText(x.path, "/"),
        label: safeText(t(x.key), x.key), // <- BLINDAJE
      }));
  }, [t, isRootOwner]);

  // Si no hay org, evita renders raros
  if (!currentOrg?.id) return null;

  return (
    <div className="flex gap-2 flex-wrap">
      {tabs.map((tab) => {
        const label = safeText(tab.label, "Tab");
        const to = safeText(tab.path, "/");
        return (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded text-xs border ${
                isActive ? "bg-slate-900 text-white" : "bg-white text-slate-700"
              }`
            }
          >
            {label}
          </NavLink>
        );
      })}
    </div>
  );
}
