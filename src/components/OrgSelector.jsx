// src/components/OrgSelector.jsx
import React, { useMemo } from "react";
import { useAuth } from "../context/AuthContext";

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

export default function OrgSelector({ className = "" }) {
  const { organizations, currentOrg, selectOrg, isAdmin, loading } = useAuth();

  const orgOptions = useMemo(() => {
    const arr = Array.isArray(organizations) ? organizations : [];
    // ✅ BUG FIX: era [.arr] (mal). Debe ser [...arr]
    return [...arr].sort((a, b) => {
      const an = safeText(a?.name).toLowerCase();
      const bn = safeText(b?.name).toLowerCase();
      if (!an && bn) return 1;
      if (an && !bn) return -1;
      return an.localeCompare(bn);
    });
  }, [organizations]);

  if (!isAdmin) return null;
  if (loading) return null;
  if (!orgOptions || orgOptions.length <= 1) return null;

  const value = safeText(currentOrg?.id, "");

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-gray-500 hidden sm:inline">Org</span>

      <select
        className="h-9 max-w-[220px] rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        value={value}
        onChange={(e) => selectOrg(e.target.value)}
        aria-label="Seleccionar organización"
      >
        {orgOptions.map((o, idx) => {
          const id = safeText(o?.id, "");
          const label = safeText(o?.name, "Organización");
          return (
            <option key={id || `org-${idx}`} value={id}>
              {label || "Organización"}
            </option>
          );
        })}
      </select>
    </div>
  );
}
