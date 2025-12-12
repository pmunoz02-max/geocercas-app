import React, { useMemo } from "react";
import { useAuth } from "../context/AuthContext";

/**
 * Selector de organización (solo Admin/Owner)
 * - Usa organizations/currentOrg/selectOrg del AuthContext
 * - No se muestra si el usuario no es admin
 * - Si hay 0 o 1 organización, no muestra selector (no aporta)
 */
export default function OrgSelector({ className = "" }) {
  const { organizations, currentOrg, selectOrg, isAdmin, loading } = useAuth();

  const orgOptions = useMemo(() => {
    const arr = Array.isArray(organizations) ? organizations : [];
    // Orden estable por name; si no hay name, al final
    return [...arr].sort((a, b) => {
      const an = String(a?.name || "").toLowerCase();
      const bn = String(b?.name || "").toLowerCase();
      if (!an && bn) return 1;
      if (an && !bn) return -1;
      return an.localeCompare(bn);
    });
  }, [organizations]);

  // Solo admins/owners
  if (!isAdmin) return null;

  // Si está cargando o no hay organizaciones, no mostrar
  if (loading) return null;

  // Si solo hay 1 org, no mostrar selector
  if (!orgOptions || orgOptions.length <= 1) return null;

  const value = currentOrg?.id || "";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-gray-500 hidden sm:inline">Org</span>

      <select
        className="h-9 max-w-[220px] rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        value={value}
        onChange={(e) => selectOrg(e.target.value)}
        aria-label="Seleccionar organización"
      >
        {orgOptions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name || "Organización"}
          </option>
        ))}
      </select>
    </div>
  );
}
