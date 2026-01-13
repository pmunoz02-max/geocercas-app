import React, { useMemo } from "react";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * OrgSelector — vOrgStable-1
 * - Usa organizations/currentOrg/selectOrg desde AuthContext
 * - Visible para owner/admin/root (isAdmin)
 * - Nunca renderiza objetos en JSX
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

export default function OrgSelector({ className = "" }) {
  const { organizations, currentOrg, selectOrg, isAdmin, loading } = useAuth();

  const orgOptions = useMemo(() => {
    const arr = Array.isArray(organizations) ? organizations : [];
    return arr
      .map((o) => {
        const id = safeText(o?.id, "");
        const name = safeText(o?.name, "");
        const label = name || "Organización";
        return { id, label };
      })
      .filter((o) => !!o.id);
  }, [organizations]);

  const value = safeText(currentOrg?.id, "");

  if (loading) {
    return (
      <div className={safeText(className)}>
        <select className="border rounded px-2 py-1 text-xs opacity-70" disabled value="">
          <option value="">Cargando…</option>
        </select>
      </div>
    );
  }

  // Solo visible para owner/admin/root
  if (!isAdmin) return null;

  return (
    <div className={safeText(className)}>
      <select
        className="border rounded px-2 py-1 text-xs"
        value={value}
        onChange={(e) => selectOrg(e.target.value)}
      >
        {orgOptions.length === 0 ? (
          <option value="">Organización</option>
        ) : (
          orgOptions.map(({ id, label }) => (
            <option key={id} value={id}>
              {safeText(label, "Organización")}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
