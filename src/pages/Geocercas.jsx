// src/pages/Geocercas.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import GeoMap from "@/components/GeoMap";
import OrgSelector from "@/components/OrgSelector";
import { listGeocercas } from "@/lib/geocercasApi";

const DBG = "[GEOCERCAS_PAGE_DBG_v2]";

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
  const [selectedGeocercaIdsApplied, setSelectedGeocercaIdsApplied] = useState([]);

  const [newGeocercaName, setNewGeocercaName] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      console.info(DBG, "load()", { orgId, user: user?.email, role });

      setGeocercas([]);
      setSelectedGeocercaIdsUI([]);
      setSelectedGeocercaIdsApplied([]);

      if (!orgId) return;

      try {
        setLoadingGeocercas(true);

        const rows = await listGeocercas({ onlyActive: true, limit: 2000 });

        if (cancelled) return;

        const safeRows = Array.isArray(rows) ? rows : [];
        console.info(DBG, "API rows", {
          orgId,
          count: safeRows.length,
          sample: safeRows.slice(0, 5).map((x) => ({
            id: x.id,
            nombre: x.nombre,
            nombre_ci: x.nombre_ci,
            org_id: x.org_id,
          })),
        });

        setGeocercas(safeRows);
      } catch (err) {
        console.error(DBG, "load error:", err);
        if (!cancelled) alert(t("geocercas.manage.loadError", { defaultValue: "No se pudieron cargar las geocercas." }));
      } finally {
        if (!cancelled) setLoadingGeocercas(false);
      }
    };

    if (!loading && user) load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, user?.id, loading]);

  const handleMostrar = () => {
    setSelectedGeocercaIdsApplied(selectedGeocercaIdsUI.map(String));
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
            defaultValue: "Selecciona una organización para gestionar geocercas.",
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
      : geocercas.filter((g) => selectedGeocercaIdsApplied.includes(String(g.id)));

  const geocercasForMapSafe = Array.isArray(geocercasForMap) ? geocercasForMap : [];

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

      <div className="flex gap-3 items-center">
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
          disabled={loadingGeocercas}
          type="button"
        >
          {loadingGeocercas
            ? t("geocercas.manage.loading", { defaultValue: "Cargando…" })
            : t("geocercas.manage.show", { defaultValue: "Mostrar" })}
        </button>
      </div>

      <div className="text-xs text-slate-500">
        {DBG} orgId=<span className="font-mono">{orgId}</span> · items=<span className="font-mono">{String(geocercas.length)}</span>
      </div>

      <GeoMap
        canEdit={canEdit}
        orgId={orgId}
        geocercas={geocercasForMapSafe}
        getNewFeatureMeta={() => ({
          nombre: newGeocercaName.trim(),
          org_id: orgId,
          created_by: user?.id ?? null,
          is_deleted: false,
        })}
      />
    </div>
  );
}
