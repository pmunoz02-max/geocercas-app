// src/pages/Geocercas.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import GeoMap from "@/components/GeoMap";
import { listGeocercas } from "@/services/geocercas";
import { supabase } from "@/supabaseClient";
import OrgSelector from "@/components/OrgSelector";

export default function GeocercasPage() {
  const { role, currentOrg, orgs } = useAuth();

  const canEdit = role === "owner" || role === "admin";
  const orgId = useMemo(
    () => currentOrg?.org_id ?? currentOrg?.id ?? null,
    [currentOrg]
  );

  const [geocercas, setGeocercas] = useState([]);
  const [loadingGeocercas, setLoadingGeocercas] = useState(false);

  // IDs seleccionados en el <select> (UI)
  const [selectedGeocercaIdsUI, setSelectedGeocercaIdsUI] = useState([]);
  // IDs que realmente se aplican al mapa al pulsar MOSTRAR
  const [selectedGeocercaIdsApplied, setSelectedGeocercaIdsApplied] =
    useState([]);

  const [newGeocercaName, setNewGeocercaName] = useState("");

  // ---------------------------------------------------------------------------
  // Cargar geocercas cuando cambia orgId
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const load = async () => {
      if (!orgId) {
        console.log("[GeocercasPage] sin orgId, limpio estado");
        setGeocercas([]);
        setSelectedGeocercaIdsUI([]);
        setSelectedGeocercaIdsApplied([]);
        return;
      }
      try {
        setLoadingGeocercas(true);
        console.log("[GeocercasPage] cargando geocercas para orgId:", orgId);
        const rows = await listGeocercas(orgId);
        console.log("[GeocercasPage] geocercas recibidas:", rows.length, rows);
        setGeocercas(rows);

        setSelectedGeocercaIdsUI([]);
        setSelectedGeocercaIdsApplied([]);
      } catch (err) {
        console.error("[GeocercasPage] error cargando geocercas:", err);
        alert("No se pudieron cargar las geocercas de esta organización.");
      } finally {
        setLoadingGeocercas(false);
      }
    };
    load();
  }, [orgId]);

  // ---------------------------------------------------------------------------
  // Manejo de selección múltiple (lista de geocercas)
  // ---------------------------------------------------------------------------
  const handleSelectChange = (e) => {
    const options = Array.from(e.target.selectedOptions);
    const ids = options.map((opt) => String(opt.value));
    setSelectedGeocercaIdsUI(ids);
  };

  const handleMostrar = () => {
    const applied = selectedGeocercaIdsUI.map(String);
    setSelectedGeocercaIdsApplied(applied);
    console.log("[GeocercasPage] MOSTRAR aplicado (IDs):", applied);
  };

  // ---------------------------------------------------------------------------
  // Eliminar organización (con advertencia si tiene geocercas / asignaciones)
  // ---------------------------------------------------------------------------
  const handleEliminarOrg = async () => {
    if (!orgId) {
      alert("No hay organización seleccionada.");
      return;
    }

    if (!currentOrg) {
      alert("No se pudo determinar la organización actual.");
      return;
    }

    const tieneGeocercas = geocercas.length > 0;
    const mensajeBase = tieneGeocercas
      ? `La organización "${currentOrg.name || "Sin nombre"}" tiene ${
          geocercas.length
        } geocerca(s).\n\nTambién puede tener asignaciones asociadas.\n\nSi continúas, se eliminará la organización y TODOS sus datos relacionados.\n\n¿Estás seguro de que deseas continuar?`
      : `¿Seguro que deseas eliminar la organización "${
          currentOrg.name || "Sin nombre"
        }" y todos sus datos relacionados (asignaciones, etc.)?`;

    const confirmar = window.confirm(mensajeBase);
    if (!confirmar) return;

    try {
      // 1) Borrar ASIGNACIONES asociadas a las geocercas de esta org
      const geocercaIds = geocercas.map((g) => g.id);

      if (geocercaIds.length > 0) {
        const { error: asignError } = await supabase
          .from("asignaciones")
          .delete()
          .in("geocerca_id", geocercaIds);

        if (asignError) {
          console.error(
            "[GeocercasPage] error borrando asignaciones:",
            asignError
          );
          alert("Error al eliminar asignaciones de la organización.");
          return;
        }
      } else {
        console.log(
          "[GeocercasPage] sin geocercas, no hay asignaciones ligadas a borrar por geocerca_id"
        );
      }

      // 2) Borrar GEOCERCAS de la organización
      const { error: geoError } = await supabase
        .from("geocercas")
        .delete()
        .eq("org_id", orgId);

      if (geoError) {
        console.error("[GeocercasPage] error borrando geocercas:", geoError);
        alert("Error al eliminar geocercas de la organización.");
        return;
      }

      // 3) Borrar ORGANIZACIÓN
      const { error: orgError } = await supabase
        .from("organizations")
        .delete()
        .eq("id", orgId);

      if (orgError) {
        console.error("[GeocercasPage] error borrando organización:", orgError);
        alert("Error al eliminar la organización.");
        return;
      }

      alert("Organización y datos asociados eliminados correctamente.");
      window.location.reload();
    } catch (err) {
      console.error(
        "[GeocercasPage] error general en eliminar organización:",
        err
      );
      alert("Ocurrió un error al eliminar la organización.");
    }
  };

  // ---------------------------------------------------------------------------
  // Geocercas que se mandan realmente al mapa
  // ---------------------------------------------------------------------------
  const geocercasForMap =
    selectedGeocercaIdsApplied.length === 0
      ? geocercas
      : geocercas.filter((g) =>
          selectedGeocercaIdsApplied.includes(String(g.id))
        );

  console.log(
    "[GeocercasPage] geocercasForMap:",
    geocercasForMap.length,
    geocercasForMap
  );

  const currentOrgName =
    currentOrg?.name ||
    currentOrg?.org_name ||
    orgs.find((o) => o.id === orgId)?.name ||
    (orgId ? "Sin nombre" : "Sin organización seleccionada");

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {/* Aquí NO dibujamos tabs ni header: eso ya lo hace el layout */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">
          Geocercas · {currentOrgName}
        </h2>
        <div className="hidden md:block">
          <OrgSelector />
        </div>
      </div>

      {/* Fila nombre + botones */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-[2]">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Nombre de nueva geocerca
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Nombre de nueva geocerca"
            value={newGeocercaName}
            onChange={(e) => setNewGeocercaName(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleMostrar}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Mostrar
          </button>

          {canEdit && orgId && (
            <button
              onClick={handleEliminarOrg}
              className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Eliminar Org
            </button>
          )}
        </div>
      </div>

      {/* Lista de geocercas activas */}
      <div className="space-y-1">
        <div className="text-sm font-semibold text-slate-700">
          Geocercas activas de la organización
        </div>
        <select
          multiple
          size={4}
          value={selectedGeocercaIdsUI}
          onChange={handleSelectChange}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {geocercas.length === 0 && (
            <option value="" disabled>
              {loadingGeocercas
                ? "Cargando geocercas..."
                : "No hay geocercas activas"}
            </option>
          )}
          {geocercas.map((g) => (
            <option key={g.id} value={String(g.id)}>
              {g.nombre || g.name || g.descripcion || "Geocerca"}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">
          Selecciona una o varias. Si no seleccionas ninguna y pulsas MOSTRAR,
          se mostrarán todas.
        </p>
        <p className="text-xs text-slate-500">
          <span className="font-semibold">
            [GeocercasPage] IDs aplicados al mapa:
          </span>{" "}
          {selectedGeocercaIdsApplied.length === 0
            ? "ninguno (todas las geocercas)"
            : JSON.stringify(selectedGeocercaIdsApplied)}
        </p>
      </div>

      {/* Mapa */}
      <GeoMap
        canEdit={canEdit}
        orgId={orgId}
        geocercas={geocercasForMap}
        getNewFeatureMeta={() => ({
          nombre: newGeocercaName,
        })}
      />
    </div>
  );
}
