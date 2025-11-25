// src/components/OrgSelector.jsx
import React from "react";
import { useAuth } from "@/context/AuthContext";

export default function OrgSelector() {
  const { orgs, currentOrg, setCurrentOrg, loading } = useAuth();

  const currentOrgId =
    currentOrg?.id ?? currentOrg?.org_id ?? (orgs[0]?.id ?? "");

  const handleChange = (e) => {
    const value = e.target.value || null;
    if (!value) {
      setCurrentOrg(null);
    } else {
      // setCurrentOrg del AuthContext acepta ID (string) o el objeto
      setCurrentOrg(value);
    }
  };

  const isDisabled = loading || orgs.length === 0;

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-slate-500">Organización:</label>
      <select
        value={currentOrgId}
        onChange={handleChange}
        disabled={isDisabled}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
        title={
          loading
            ? "Cargando organizaciones…"
            : orgs.length === 0
            ? "No tienes organizaciones (agrega una o pide invitación)"
            : "Selecciona organización"
        }
      >
        {orgs.length === 0 ? (
          <option value="">— Sin organizaciones —</option>
        ) : (
          orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name || o.org_name || "Sin nombre"}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
