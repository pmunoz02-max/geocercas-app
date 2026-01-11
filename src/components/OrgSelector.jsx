import React, { useMemo } from "react";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * OrgSelector — FIX React #300
 * Nunca renderizar objetos en JSX. Normaliza cualquier valor a string.
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
    return arr.map((o) => {
      const id = safeText(o?.id, "");
      const name = safeText(o?.name, "");
      // Si name viene raro (objeto/null), mostramos fallback seguro
      const label = name || "Organización";
      return { id, label };
    });
  }, [organizations]);

  const value = safeText(currentOrg?.id, "");

  // Si está cargando o no hay orgs, no renderiza cosas raras
  if (loading) {
    return (
      <div className={safeText(className)}>
        <select className="border rounded px-2 py-1 text-xs opacity-70" disabled value="">
          <option value="">Cargando…</option>
        </select>
      </div>
    );
  }

  // Si no es admin/owner, puedes decidir ocultarlo (mantengo tu lógica original probable)
  if (!isAdmin) {
    return null;
  }

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
            <option key={id || `org-${label}`} value={id}>
              {safeText(label, "Organización")}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
