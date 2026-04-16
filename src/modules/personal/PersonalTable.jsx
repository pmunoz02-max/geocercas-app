// src/modules/personal/PersonalTable.jsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listPersonal, deletePersonal } from "../../lib/personalApi.js";
import { useAuth } from "@/auth/AuthProvider.jsx";
export default function PersonalTable() {
  const { t } = useTranslation();
  const { loading: authLoading, user, session } = useAuth();

  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(true); // <- Activos por defecto
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  async function fetchRows() {
    if (!session || !user) {
      setErrorMsg(t("personal.noActiveSession"));
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg("");
    const { data, error } = await listPersonal({
      q,
      onlyActive,       // <- si es false, trae TODO
      limit: 500,
    });
    if (error) setErrorMsg(error.message || t("personal.errorLoad"));
    // defensa: evitar filas null
    setRows(Array.isArray(data) ? data.filter(Boolean) : []);
    setLoading(false);
  }

  useEffect(() => {
    if (!authLoading) fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // Búsqueda local en UI (además del filtro de la API)
  const filtered = useMemo(() => {
    if (!q) return rows;
    const ql = q.toLowerCase();
    return rows.filter((r) =>
      `${r?.nombre ?? ""} ${r?.apellido ?? ""} ${r?.email ?? ""} ${r?.telefono ?? ""}`
        .toLowerCase()
        .includes(ql)
    );
  }, [rows, q]);

  const onDelete = async (row) => {
    if (!row?.id) return;
    if (!window.confirm(t("personal.confirmDelete"))) return;
    const { error } = await deletePersonal(row.id);
    if (error) {
      setErrorMsg(error.message || t("personal.errorDelete"));
    } else {
      fetchRows();
    }
  };

  if (authLoading) {
    return <div className="p-6 text-gray-500">{t("common.actions.loading")}</div>;
  }

  return (
    <div className="w-full">
      {/* Filtros */}
      <div className="mt-3 mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          className="border rounded-md px-3 py-2 text-sm w-72"
          placeholder={t("personal.searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
          />
          {t("personal.onlyActive")}
        </label>
        <button
          className="px-3 py-2 rounded-md bg-gray-900 text-white text-sm"
          onClick={fetchRows}
          disabled={loading}
        >
          {loading ? t("personal.processing") : t("personal.buttonRefresh")}
        </button>
      </div>

      {errorMsg && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
          {errorMsg}
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-gray-600">
              <th className="px-3">{t("personal.table.columns.firstName")}</th>
              <th className="px-3">{t("personal.table.columns.email")}</th>
              <th className="px-3">{t("personal.table.columns.phone")}</th>
              <th className="px-3">{t("personal.table.columns.active")}</th>
              <th className="px-3">{t("personal.legacyTable.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={5}>
                  {t("common.actions.loading")}
                </td>
              </tr>
            ) : filtered.length ? (
              filtered.map((r, idx) => (
                <tr key={r?.id ?? `row-${idx}`} className="bg-white rounded-md shadow-sm">
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {(r?.nombre || "").trim()} {(r?.apellido || "").trim()}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r?.email || "—"}</td>
                  <td className="px-3 py-2">{r?.telefono || "—"}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-gray-100">
                      {r?.activo_bool ? t("common.actions.yes") : t("common.actions.no")}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        className="px-2 py-1 rounded-md bg-sky-600 text-white"
                        onClick={() => alert(t("personal.legacyTable.todoEdit"))}
                      >
                        {t("personal.buttonEdit")}
                      </button>
                      <button
                        className="px-2 py-1 rounded-md bg-rose-600 text-white"
                        onClick={() => onDelete(r)}
                      >
                        {t("personal.legacyTable.softDelete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={5}>
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación placeholder (si la necesitas luego) */}
      <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
        <span>{t("common.pagination.pageOf", { page: 1, total: 1 })}</span>
        <button className="px-2 py-1 rounded bg-gray-200" disabled>{t("common.pagination.prev")}</button>
        <button className="px-2 py-1 rounded bg-gray-200" disabled>{t("common.pagination.next")}</button>
      </div>
    </div>
  );
}
