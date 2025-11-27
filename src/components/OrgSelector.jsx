// src/components/OrgSelector.jsx
// Selector simple de organización en el header.
// Reglas importantes:
//  - Si NO hay usuario (user === null) → NO renderiza nada.
//    Esto evita que en /login aparezca el mensaje de organización.
//  - Si hay usuario pero no currentOrg → muestra un botón para seleccionar.
//  - Si hay usuario y currentOrg → muestra el nombre y permite cambiarla.

import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function OrgSelector() {
  const { user, currentOrg, loading } = useAuth();
  const navigate = useNavigate();

  // Mientras carga el contexto, no mostramos nada.
  // El layout puede enseñar su propio "skeleton" si quiere.
  if (loading) {
    return null;
  }

  // ⬇⬇⬇ CLAVE:
  // Si NO hay usuario (por ejemplo en /login),
  // NO se renderiza nada del selector de organización.
  if (!user) {
    return null;
  }

  const orgName =
    currentOrg?.name ||
    currentOrg?.org_name ||
    "Seleccionar organización";

  const hasOrg = Boolean(currentOrg);

  const handleClick = () => {
    // Enviamos siempre a la pantalla dedicada para elegir organización.
    navigate("/seleccionar-organizacion");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs md:text-sm text-slate-700 hover:bg-slate-50 hover:border-emerald-500 transition"
    >
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-semibold">
        {orgName.charAt(0).toUpperCase()}
      </span>
      <span className="max-w-[160px] truncate">
        {hasOrg ? orgName : "Seleccionar organización"}
      </span>
    </button>
  );
}
