// src/components/GeocercasActivas.jsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listarGeocercasActivas,
  cambiarEstadoGeocerca,
} from "../services/geocercas";

export default function GeocercasActivas() {
  const { t } = useTranslation();
  const tr = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [limit] = useState(20);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const offset = (page - 1) * limit;

  const fetchData = async () => {
    setLoading(true);
    const { data, error, count: total } = await listarGeocercasActivas({
      limit,
      offset,
      search,
    });
    setLoading(false);

    if (error) {
      // eslint-disable-next-line no-alert
      window.alert(
        error.message ||
          tr(
            "activeGeofences.errors.load",
            "Could not load active geofences."
          )
      );
      return;
    }

    setRows(data || []);
    setCount(total || 0);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const onSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchData();
  };

  const totalPages = Math.max(1, Math.ceil(count / limit));

  const desactivar = async (id) => {
    const ok = window.confirm(
      tr(
        "activeGeofences.confirmDeactivate",
        "Do you want to deactivate this geofence?"
      )
    );
    if (!ok) return;

    const { error } = await cambiarEstadoGeocerca(id, false);
    if (error) {
      window.alert(
        error.message ||
          tr(
            "activeGeofences.errors.deactivate",
            "Could not deactivate the geofence."
          )
      );
      return;
    }

    fetchData();
  };

  return (
    <div className="space-y-3">
      <form onSubmit={onSearch} className="flex items-center gap-2">
        <input
          type="text"
          className="w-full rounded border px-3 py-2"
          placeholder={tr(
            "activeGeofences.searchPlaceholder",
            "Search by name..."
          )}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="rounded bg-gray-800 px-4 py-2 text-white"
          type="submit"
          disabled={loading}
        >
          {tr("activeGeofences.actions.search", "Search")}
        </button>
      </form>

      <div className="overflow-x-auto rounded border">
        <table className="min-w-full">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="px-3 py-2">
                {tr("activeGeofences.table.name", "Name")}
              </th>
              <th className="px-3 py-2">
                {tr("activeGeofences.table.active", "Active")}
              </th>
              <th className="px-3 py-2">
                {tr("activeGeofences.table.created", "Created")}
              </th>
              <th className="px-3 py-2">
                {tr("activeGeofences.table.actions", "Actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-2" colSpan={4}>
                  {tr("activeGeofences.states.loading", "Loading...")}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-2" colSpan={4}>
                  {tr("activeGeofences.states.empty", "No results")}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.nombre}</td>
                  <td className="px-3 py-2">
                    {r.activa
                      ? tr("common.yes", "Yes")
                      : tr("common.no", "No")}
                  </td>
                  <td className="px-3 py-2">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : "-"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="rounded bg-red-600 px-3 py-1 text-white"
                      onClick={() => desactivar(r.id)}
                      title={tr(
                        "activeGeofences.actions.deactivate",
                        "Deactivate"
                      )}
                    >
                      {tr("activeGeofences.actions.deactivate", "Deactivate")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm">
          {tr("activeGeofences.pagination.total", "Total")}: {count}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border px-3 py-1"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {tr("activeGeofences.pagination.previous", "← Previous")}
          </button>

          <span className="text-sm">
            {tr("activeGeofences.pagination.pageOf", "Page {{page}} of {{total}}", {
              page,
              total: totalPages,
            })}
          </span>

          <button
            type="button"
            className="rounded border px-3 py-1"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {tr("activeGeofences.pagination.next", "Next →")}
          </button>
        </div>
      </div>
    </div>
  );
}