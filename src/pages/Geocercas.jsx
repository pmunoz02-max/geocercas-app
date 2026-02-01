// src/pages/Geocercas.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import GeoMap from "@/components/GeoMap";
import OrgSelector from "@/components/OrgSelector";
import { supabase } from "../supabaseClient.js";
import { listGeocercasForOrg } from "@/lib/geocercasApi";

export default function GeocercasPage() {
  const { user, role, currentOrg, orgs, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const canEdit = role === "owner" || role === "admin";

  const orgId = useMemo(
    () => currentOrg?.org_id ?? currentOrg?.id ?? null,
    [currentOrg]
  );

  const [geocercas, setGeocercas] = useState([]);
  const [loadingGeocercas, setLoadingGeocercas] = useState(false);

  const [selectedGeocercaIdsUI, setSelectedGeocercaIdsUI] = useState([]);
  const [selectedGeocercaIdsApplied, setSelectedGeocercaIdsApplied] =
    useState([]);

  const [newGeocercaName, setNewGeocercaName] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!orgId) {
        setGeocercas([]);
        setSelectedGeocercaIdsUI([]);
        setSelectedGeocercaIdsApplied([]);
        return;
      }

      // Reset inmediato al cambiar de org para evitar “mezclas visuales”
      setGeocercas([]);
      setSelectedGeocercaIdsUI([]);
      setSelectedGeocercaIdsApplied([]);

      try {
        setLoadingGeocercas(true);

        // ✅ FIX: scoping por org activa
        const rows = await listGeocercasForOrg(orgId);
        setGeocercas(Array.isArray(rows) ? rows : []);
      } catch (err) {
        console.error("[GeocercasPage] load error:", err);
        alert(
          t("geocercas.manage.loadError", {
            defaultValue: "No se pudieron cargar las geocercas.",
          })
        );
      } finally {
        setLoadingGeocercas(false);
      }
    };

    load();
  }, [orgId, t]);

  const handleSelectChange = (e) => {
    const options = Array.from(e.target.selectedOptions);
    setSelectedGeocercaIdsUI(options.map((opt) => String(opt.value)));
  };

  const handleMostrar = () => {
    setSelectedGeocercaIdsApplied(selectedGeocercaIdsUI.map(String));
  };

  const handleEliminarOrg = async () => {
    if (!canEdit) {
      alert(
        t("geocercas.manage.noPermDeleteOrg", {
          defaultValue: "No tienes permisos para eliminar organizaciones.",
        })
      );
      return;
    }

    if (!orgId || !currentOrg) return;

    const orgName =
      currentOrg?.name ||
      currentOrg?.org_name ||
      orgs?.find((o) => o.id === orgId)?.name ||
      "esta organización";

    const confirmText = `¿Eliminar "${orgName}" y todos sus datos? Esta acción NO se puede deshacer.`;
    if (!window.confirm(confirmText)) return;

    try {
      // Precaución: borrado en cascada manual (pruebas)
      const geocercaIds = geocercas.map((g) => g.id).filter(Boolean);

      if (geocercaIds.length > 0) {
        // Nota: si asignaciones tiene org_id, mejor filtrar por org_id también.
        await supabase
          .from("asignaciones")
          .delete()
          .in("geocerca_id", geocercaIds);
      }

      await supabase.from("geocercas").delete().eq("org_id", orgId);

      // OJO: verifica si tu tabla es public.organizations o app.organizations.
      // Aquí mantengo el nombre que tenías. Si falla, te doy el ajuste.
      await supabase.from("organizations").delete().eq("id", orgId);

      alert(
        t("geocercas.manage.orgDeleted", {
          defaultValue: "Organización eliminada.",
        })
      );
      window.location.reload();
    } catch (err) {
      console.error("[GeocercasPage] delete org error:", err);
      alert(
        t("geocercas.manage.deleteOrgError", {
          defaultValue: "Error eliminando organización.",
        })
      );
    }
  };

  if (loading || !user) return null;

  if (!orgId) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <h2 className="text-lg font-semibold">
          {t("geocercas.manage.noOrgTitle", { defaultValue: "Geocercas" })}
        </h2>
        <p className="text-sm">
          {t("geocercas.manage.noOrgBody", {
            defaultValue:
              "Selecciona una organización para gestionar geocercas.",
          })}
        </p>
        <button
          onClick={() => navigate("/seleccionar-organizacion")}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-white"
        >
          {t("geocercas.manage.selectOrgButton", {
            defaultValue: "Seleccionar organización",
          })}
        </button>
      </div>
    );
  }

  const currentOrgName =
    currentOrg?.name ||
    currentOrg?.org_name ||
    orgs?.find((o) => o.id === orgId)?.name ||
    "Sin nombre";

  const geocercasForMap =
    selectedGeocercaIdsApplied.length === 0
      ? geocercas
      : geocercas.filter((g) =>
          selectedGeocercaIdsApplied.includes(String(g.id))
        );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {t("geocercas.manage.headerTitle", {
            orgName: currentOrgName,
            defaultValue: `Geocercas · ${currentOrgName}`,
          })}
        </h2>
        <OrgSelector />
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          className="flex-1 rounded-lg border px-3 py-2"
          placeholder={t("geocercas.manage.newNameLabel", {
            defaultValue: "Nombre de nueva geocerca",
          })}
          value={newGeocercaName}
          onChange={(e) => setNewGeocercaName(e.target.value)}
        />

        <button
          onClick={handleMostrar}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white"
        >
          {t("geocercas.manage.showButton", { defaultValue: "Mostrar" })}
        </button>

        {canEdit && (
          <button
            onClick={handleEliminarOrg}
            className="rounded-lg bg-red-600 px-4 py-2 text-white"
          >
            {t("geocercas.manage.deleteOrgButton", {
              defaultValue: "Eliminar Org",
            })}
          </button>
        )}
      </div>

      {loadingGeocercas && (
        <div className="text-sm text-slate-500">
          {t("geocercas.manage.loading", { defaultValue: "Cargando..." })}
        </div>
      )}

      <GeoMap
        canEdit={canEdit}
        orgId={orgId}
        geocercas={geocercasForMap}
        getNewFeatureMeta={() => ({
          nombre: newGeocercaName.trim(),
          org_id: orgId,
          owner_id: user?.id ?? null,
          vigente: true,
          is_deleted: false,
        })}
      />
    </div>
  );
}
