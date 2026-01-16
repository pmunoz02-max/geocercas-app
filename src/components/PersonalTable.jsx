import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

export default function PersonalTable({ rows, loading, onEdit }) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="p-4">
        {t("personal.table.loading", { defaultValue: "⟪personal.table.loading⟫" })}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="p-4">
        {t("personal.table.noActive", { defaultValue: "⟪personal.table.noActive⟫" })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="text-left">
            <th className="px-4 py-2">
              {t("personal.table.columns.firstName", { defaultValue: "⟪personal.table.columns.firstName⟫" })}
            </th>
            <th className="px-4 py-2">
              {t("personal.table.columns.lastName", { defaultValue: "⟪personal.table.columns.lastName⟫" })}
            </th>
            <th className="px-4 py-2">
              {t("personal.table.columns.email", { defaultValue: "⟪personal.table.columns.email⟫" })}
            </th>
            <th className="px-4 py-2">
              {t("personal.table.columns.phone", { defaultValue: "⟪personal.table.columns.phone⟫" })}
            </th>
            <th className="px-4 py-2">
              {t("personal.table.columns.active", { defaultValue: "⟪personal.table.columns.active⟫" })}
            </th>
            <th className="px-4 py-2">
              {t("personal.table.columns.start", { defaultValue: "⟪personal.table.columns.start⟫" })}
            </th>
            <th className="px-4 py-2">
              {t("personal.table.columns.end", { defaultValue: "⟪personal.table.columns.end⟫" })}
            </th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t hover:bg-gray-50">
              <td className="px-4 py-2">{r.nombre}</td>
              <td className="px-4 py-2">{r.apellido}</td>
              <td className="px-4 py-2">{r.email}</td>
              <td className="px-4 py-2">{r.telefono}</td>
              <td className="px-4 py-2">
                {r.vigente
                  ? t("common.yes", { defaultValue: "⟪common.yes⟫" })
                  : t("common.no", { defaultValue: "⟪common.no⟫" })}
              </td>
              <td className="px-4 py-2">{r.fecha_inicio || ""}</td>
              <td className="px-4 py-2">{r.fecha_fin || ""}</td>
              <td className="px-4 py-2 text-right">
                <button
                  onClick={() => onEdit(r)}
                  className="rounded-lg px-3 py-1 border hover:bg-gray-100"
                >
                  {t("common.edit", { defaultValue: "⟪common.edit⟫" })}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

PersonalTable.propTypes = {
  rows: PropTypes.array,
  loading: PropTypes.bool,
  onEdit: PropTypes.func,
};
