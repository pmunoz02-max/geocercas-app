// src/components/DeleteAllGeocercasButton.jsx
import React from "react";
import { useGeocercas } from "../hooks/useGeocercas";

export default function DeleteAllGeocercasButton() {
  const { geocercas, removeAllByState, refetch, resetLocalCache } = useGeocercas();

  const handleDeleteAll = async () => {
    if (!geocercas?.length) {
      alert("No hay geocercas para borrar.");
      return;
    }
    const ok = window.confirm(`Se eliminarán ${geocercas.length} geocercas. ¿Continuar?`);
    if (!ok) return;

    try {
      await removeAllByState();  // ← RPC delete_all_geocercas_for_user
      resetLocalCache();
      await refetch();
      alert("Geocercas eliminadas.");
    } catch (e) {
      alert(`No se pudo borrar: ${e.message || e}`);
    }
  };

  return (
    <button
      onClick={handleDeleteAll}
      style={{
        padding: "8px 12px",
        borderRadius: 999,
        border: "2px solid #ef4444",
        cursor: "pointer",
        background: "white",
        color: "#ef4444",
        fontWeight: 700,
      }}
      title="Borrar todas las geocercas (servidor)"
    >
      🗑️ BORRAR GEOCERCAS
    </button>
  );
}
