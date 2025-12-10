// src/pages/CostosPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { useModuleAccess } from "../hooks/useModuleAccess";
import { MODULE_KEYS } from "../lib/permissions";

const emptyOption = { value: "", label: "Todos" };

function summarizeByCurrency(rows) {
  const map = new Map();

  for (const row of rows || []) {
    const currency = row.currency_code || "N/A";
    const prev = map.get(currency) || { currency, totalCost: 0, totalHours: 0 };

    map.set(currency, {
      currency,
      totalCost: prev.totalCost + (Number(row.costo) || 0),
      totalHours: prev.totalHours + (Number(row.horas) || 0),
    });
  }

  return Array.from(map.values());
}

function formatNumber(n, decimals = 2) {
  if (n == null || Number.isNaN(Number(n))) return "-";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Normaliza las fechas de filtro (inputs type="date") a un rango de
 * timestamptz ISO listo para enviar a Supabase.
 *
 * - fromDateStr → YYYY-MM-DD → fromIso = ese día a las 00:00:00
 * - toDateStr   → YYYY-MM-DD → toIsoExclusive = día siguiente a las 00:00:00
 *
 * El rango se aplica como:
 *   start_time >= fromIso
 *   start_time  < toIsoExclusive
 *
 * De esta forma se incluye TODO el día "Hasta" completo.
 */
function buildDateRange(fromDateStr, toDateStr) {
  let fromIso = null;
  let toIsoExclusive = null;

  if (fromDateStr) {
    const d = new Date(fromDateStr + "T00:00:00");
    if (!Number.isNaN(d.getTime())) {
      fromIso = d.toISOString();
    }
  }

  if (toDateStr) {
    const d = new Date(toDateStr + "T00:00:00");
    if (!Number.isNaN(d.getTime())) {
      d.setDate(d.getDate() + 1); // día siguiente a las 00:00
      toIsoExclusive = d.toISOString();
    }
  }

  return { fromIso, toIsoExclusive };
}

const CostosPage = () => {
  const { currentOrg } = useAuth();
  const { t } = useTranslation();

  // Acceso universalizado: usa matriz de permisos central
  // loadingAccess es opcional: si el hook no lo expone, será undefined
  const { role, canView, loading: loadingAccess } = useModuleAccess(
    MODULE_KEYS.REPORTES_COSTOS
  );

  // Filtros
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [selectedActividadId, setSelectedActividadId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");

  // Datos para combos
  const [personas, setPersonas] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [geocercas, setGeocercas] = useState([]);

  // Filas detalladas del reporte
  const [rows, setRows] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [error, setError] = useState("");

  // EXPORTAR CSV
  const handleExportCSV = () => {
    if (!rows || rows.length === 0) {
      alert(t("reportes.exportNoData"));
      return;
    }

    const header = [
      t("reportes.csvHeaderPersona"),
      t("reportes.csvHeaderGeocerca"),
      t("reportes.csvHeaderActividad"),
      t("reportes.csvHeaderInicio"),
      t("reportes.csvHeaderFin"),
      t("reportes.csvHeaderHoras"),
      t("reportes.csvHeaderTarifa"),
      t("reportes.csvHeaderCosto"),
      t("reportes.csvHeaderMoneda"),
    ];

    const csvRows = [header.join(";")];

    for (const r of rows) {
      const line = [
        (r.personal_nombre || "").replace(/;/g, ","),
        (r.geocerca_nombre || "").replace(/;/g, ","),
        (r.actividad_nombre || "").replace(/;/g, ","),
        formatDateTime(r.start_time),
        formatDateTime(r.end_time),
        String(r.horas ?? "").replace(/;/g, ","),
        String(r.hourly_rate ?? "").replace(/;/g, ","),
        String(r.costo ?? "").replace(/;/g, ","),
        r.currency_code || "",
      ];
      csvRows.push(line.join(";"));
    }

    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `costos_${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Cargar combos básicos (personas, actividades, geocercas)
  useEffect(() => {
    if (!currentOrg?.id || !canView) return;

    const loadFilters = async () => {
      setLoadingFilters(true);
      setError("");

      try {
        // Personas
        const { data: personasData, error: personasErr } = await supabase
          .from("personal")
          .select("id, nombre, email")
          .eq("org_id", currentOrg.id)
          .eq("is_deleted", false)
          .order("nombre", { ascending: true });

        if (personasErr) throw personasErr;

        // Actividades
        const { data: actData, error: actErr } = await supabase
          .from("activities")
          .select("id, name")
          .eq("tenant_id", currentOrg.id)
          .eq("active", true)
          .order("name", { ascending: true });

        if (actErr) throw actErr;

        // Geocercas
        const { data: geoData, error: geoErr } = await supabase
          .from("geocercas")
          .select("id, nombre")
          .eq("org_id", currentOrg.id)
          .order("nombre", { ascending: true });

        if (geoErr) throw geoErr;

        setPersonas(personasData || []);
        setActividades(actData || []);
        setGeocercas(geoData || []);
      } catch (e) {
        console.error("[CostosPage] Error cargando filtros:", e);
        setError(t("reportes.errorLoadFilters"));
      } finally {
        setLoadingFilters(false);
      }
    };

    loadFilters();
  }, [currentOrg?.id, canView, t]);

  // Cargar reporte principal
  const fetchReport = async () => {
    if (!currentOrg?.id || !canView) return;

    setLoading(true);
    setError("");

    try {
      // Validación sencilla de rango
      if (fromDate && toDate && fromDate > toDate) {
        setRows([]);
        setError(t("reportes.errorRangeInvalid"));
        return;
      }

      let query = supabase
        .from("v_costos_detalle")
        .select(
          `
          id,
          org_id,
          tenant_id,
          personal_id,
          personal_nombre,
          actividad_id,
          actividad_nombre,
          geocerca_id,
          geocerca_nombre,
          start_time,
          end_time,
          horas,
          hourly_rate,
          costo,
          currency_code
        `
        )
        .eq("org_id", currentOrg.id);

      // Rango de fechas normalizado sobre start_time
      const { fromIso, toIsoExclusive } = buildDateRange(fromDate, toDate);

      if (fromIso) {
        query = query.gte("start_time", fromIso);
      }
      if (toIsoExclusive) {
        query = query.lt("start_time", toIsoExclusive);
      }

      // Aplicar filtros de persona / actividad / geocerca
      if (selectedPersonaId && selectedPersonaId !== emptyOption.value) {
        query = query.eq("personal_id", selectedPersonaId);
      }
      if (selectedActividadId && selectedActividadId !== emptyOption.value) {
        query = query.eq("actividad_id", selectedActividadId);
      }
      if (selectedGeocercaId && selectedGeocercaId !== emptyOption.value) {
        query = query.eq("geocerca_id", selectedGeocercaId);
      }

      const { data, error: dataErr, status } = await query;

      if (dataErr) {
        if (status === 404) {
          console.warn(
            "[CostosPage] La vista v_costos_detalle no existe aún en Supabase."
          );
          setRows([]);
          setError(t("reportes.errorViewMissing"));
          return;
        }
        throw dataErr;
      }

      setRows(data || []);
    } catch (e) {
      console.error("[CostosPage] Error cargando reporte:", e);
      setError(t("reportes.errorLoadReport"));
    } finally {
      setLoading(false);
    }
  };

  // Carga inicial automática
  useEffect(() => {
    if (!currentOrg?.id || !canView) return;
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id, canView]);

  // === RESÚMENES NUMÉRICOS ===
  const resumenMoneda = useMemo(
    () => summarizeByCurrency(rows || []),
    [rows]
  );

  const totalGlobal = useMemo(() => {
    let totalCost = 0;
    let totalHours = 0;

    for (const r of rows || []) {
      totalCost += Number(r.costo) || 0;
      totalHours += Number(r.horas) || 0;
    }

    return { totalCost, totalHours };
  }, [rows]);

  // Si el hook aún está resolviendo el rol, mostramos un estado de carga
  if (loadingAccess) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-semibold mb-2">
          {t("reportes.title")}
        </h1>
        <p className="text-sm text-gray-600">
          {t("reportes.loadingPermissions") || "Cargando permisos…"}
        </p>
      </div>
    );
  }

  // Sin permisos (una vez que ya sabemos el rol)
  if (!canView) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-semibold mb-2">
          {t("reportes.title")}
        </h1>
        <p className="text-sm text-gray-600">
          {t("reportes.noAccessBody")}
        </p>
        {/* Texto de debug: puedes quitarlo en producción */}
        <p className="mt-2 text-xs text-gray-400">
          (Rol actual: {role || "sin rol"})
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("reportes.title")}</h1>
          <p className="text-sm text-gray-600">
            {t("reportes.headerSubtitle")}
          </p>
        </div>
        {loading && (
          <div className="text-xs text-gray-500 animate-pulse">
            {t("reportes.loadingReport")}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">
          {t("reportes.filtersTitle")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Fecha desde */}
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600 mb-1">
              {t("reportes.filtersFrom")}
            </label>
            <input
              type="date"
              className="border rounded-lg px-2 py-1 text-sm"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          {/* Fecha hasta */}
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600 mb-1">
              {t("reportes.filtersTo")}
            </label>
            <input
              type="date"
              className="border rounded-lg px-2 py-1 text-sm"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          {/* Persona */}
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600 mb-1">
              {t("reportes.filtersPerson")}
            </label>
            <select
              className="border rounded-lg px-2 py-1 text-sm"
              value={selectedPersonaId}
              onChange={(e) => setSelectedPersonaId(e.target.value)}
              disabled={loadingFilters}
            >
              <option value={emptyOption.value}>
                {t("reportes.filtersAll")}
              </option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre || p.email || t("reportes.personNoName")}
                </option>
              ))}
            </select>
          </div>

          {/* Actividad */}
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600 mb-1">
              {t("reportes.filtersActivity")}
            </label>
            <select
              className="border rounded-lg px-2 py-1 text-sm"
              value={selectedActividadId}
              onChange={(e) => setSelectedActividadId(e.target.value)}
              disabled={loadingFilters}
            >
              <option value={emptyOption.value}>
                {t("reportes.filtersAll")}
              </option>
              {actividades.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Geocerca */}
          <div className="flex flex-col md:col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1">
              {t("reportes.filtersGeofence")}
            </label>
            <select
              className="border rounded-lg px-2 py-1 text-sm"
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
              disabled={loadingFilters}
            >
              <option value={emptyOption.value}>
                {t("reportes.filtersAll")}
              </option>
              {geocercas.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="px-3 py-1 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setFromDate("");
              setToDate("");
              setSelectedPersonaId("");
              setSelectedActividadId("");
              setSelectedGeocercaId("");
              setError("");
            }}
            disabled={loading || loadingFilters}
          >
            {t("reportes.filtersClear")}
          </button>

          <button
            type="button"
            className="px-4 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={fetchReport}
            disabled={loading || loadingFilters}
          >
            {t("reportes.filtersApply")}
          </button>
        </div>

        {error && (
          <div className="text-xs text-red-600 mt-1">
            <strong>{t("reportes.errorLabel")} </strong>
            {error}
          </div>
        )}
      </div>

      {/* Tarjetas resumen generales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl shadow p-3 flex flex-col">
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            {t("reportes.summaryTotalHoursLabel")}
          </span>
          <span className="text-xl font-bold">
            {formatNumber(totalGlobal.totalHours, 2)}
          </span>
          <span className="text-[11px] text-gray-500 mt-1">
            {t("reportes.summaryTotalHoursHelp")}
          </span>
        </div>

        <div className="bg-white rounded-xl shadow p-3 flex flex-col">
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            {t("reportes.summaryTotalCostLabel")}
          </span>
          <span className="text-xl font-bold">
            {formatNumber(totalGlobal.totalCost, 2)}
          </span>
          <span className="text-[11px] text-gray-500 mt-1">
            {t("reportes.summaryTotalCostHelp")}
          </span>
        </div>

        <div className="bg-white rounded-xl shadow p-3 flex flex-col">
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            {t("reportes.summaryRecordsLabel")}
          </span>
          <span className="text-xl font-bold">{rows.length}</span>
          <span className="text-[11px] text-gray-500 mt-1">
            {t("reportes.summaryRecordsHelp")}
          </span>
        </div>
      </div>

      {/* Tabla detallada + botón exportar */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            {t("reportes.tableTitle")}
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">
              {t("reportes.tableExportHelp")}
            </span>
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {t("reportes.tableExportButton")}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs table-auto">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left font-semibold text-gray-600">
                  {t("reportes.colPersona")}
                </th>
                <th className="px-2 py-1 text-left font-semibold text-gray-600">
                  {t("reportes.colGeocerca")}
                </th>
                <th className="px-2 py-1 text-left font-semibold text-gray-600">
                  {t("reportes.colActividad")}
                </th>
                <th className="px-2 py-1 text-left font-semibold text-gray-600">
                  {t("reportes.colInicio")}
                </th>
                <th className="px-2 py-1 text-left font-semibold text-gray-600">
                  {t("reportes.colFin")}
                </th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600">
                  {t("reportes.colHoras")}
                </th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600">
                  {t("reportes.colTarifa")}
                </th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600">
                  {t("reportes.colCosto")}
                </th>
                <th className="px-2 py-1 text-left font-semibold text-gray-600">
                  {t("reportes.colMoneda")}
                </th>
              </tr>
            </thead>
            <tbody>
              {(!rows || rows.length === 0) && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-2 py-6 text-center text-xs text-gray-500"
                  >
                    {t("reportes.tableEmpty")}
                  </td>
                </tr>
              )}
              {(rows || []).map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-2 py-1">
                    {r.personal_nombre || t("reportes.personNoName")}
                  </td>
                  <td className="px-2 py-1">
                    {r.geocerca_nombre || t("reportes.geofenceNoName")}
                  </td>
                  <td className="px-2 py-1">
                    {r.actividad_nombre || t("reportes.activityNoName")}
                  </td>
                  <td className="px-2 py-1">
                    {formatDateTime(r.start_time)}
                  </td>
                  <td className="px-2 py-1">
                    {formatDateTime(r.end_time)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatNumber(r.horas, 2)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatNumber(r.hourly_rate, 2)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatNumber(r.costo, 2)}
                  </td>
                  <td className="px-2 py-1">{r.currency_code || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Si alguna vez quieres usar resumen por moneda:
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {resumenMoneda.map((r) => (
            <div key={r.currency} className="bg-gray-50 rounded-lg p-2 text-xs">
              <div className="font-semibold">{r.currency}</div>
              <div>
                {t("reportes.summaryCurrencyHours")}:{" "}
                {formatNumber(r.totalHours, 2)}
              </div>
              <div>
                {t("reportes.summaryCurrencyCost")}:{" "}
                {formatNumber(r.totalCost, 2)}
              </div>
            </div>
          ))}
        </div>
        */}
      </div>
    </div>
  );
};

export default CostosPage;
