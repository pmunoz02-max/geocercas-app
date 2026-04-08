// src/components/DeleteAllGeocercasButton.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import { useGeocercas } from "../hooks/useGeocercas";

export default function DeleteAllGeocercasButton() {
  const { t } = useTranslation();
  const tr = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const { geocercas, removeAllByState, refetch, resetLocalCache } = useGeocercas();

  const handleDeleteAll = async () => {
    if (!geocercas?.length) {
      window.alert(
        tr("deleteAllGeofences.messages.empty", "There are no geofences to delete.")
      );
      return;
    }

    const ok = window.confirm(
      tr(
        "deleteAllGeofences.confirm",
        "{{count}} geofences will be deleted. Continue?",
        { count: geocercas.length }
      )
    );
    if (!ok) return;

    try {
      await removeAllByState();
      resetLocalCache();
      await refetch();
      window.alert(
        tr("deleteAllGeofences.messages.success", "Geofences deleted.")
      );
    } catch (e) {
      window.alert(
        tr(
          "deleteAllGeofences.errors.delete",
          "Could not delete the geofences. Please try again."
        )
      );
    }
  };

  return (
    <button
      type="button"
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
      title={tr(
        "deleteAllGeofences.title",
        "Delete all geofences (server)"
      )}
    >
      {tr("deleteAllGeofences.button", "🗑️ DELETE GEOFENCES")}
    </button>
  );
}