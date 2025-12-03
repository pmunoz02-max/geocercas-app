// src/pages/ActividadesPage.jsx
import { useEffect, useState } from "react";
import {
  listActividades,
  createActividad,
  updateActividad,
  toggleActividadActiva,
  deleteActividad,
} from "../lib/actividadesApi";

import { useAuth } from "../context/AuthContext.jsx";

// 🔹 Lista estática de monedas ISO 4217 (las más usadas; puedes ampliarla luego)
const CURRENCIES = [
  { code: "USD", name: "Dólar estadounidense" },
  { code: "EUR", name: "Euro" },
  { code: "MXN", name: "Peso mexicano" },
  { code: "COP", name: "Peso colombiano" },
  { code: "PEN", name: "Sol peruano" },
  { code: "CLP", name: "Peso chileno" },
  { code: "ARS", name: "Peso argentino" },
  { code: "BRL", name: "Real brasileño" },
  { code: "CAD", name: "Dólar canadiense" },
  { code: "GBP", name: "Libra esterlina" },
];

export default function ActividadesPage() {
  const { profile, role } = useAuth(); // Aquí viene tenant_id/org_id y el rol
  const [actividades, setActividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [formMode, setFormMode] = useState("create"); // 'create' | 'edit'
  const [editingId, setEditingId] = useState(null);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");

  // 🔹 Campos nuevos
  const [currency, setCurrency] = useState("USD");
  const [hourlyRate, setHourlyRate] = useState("");

  async function loadActividades() {
    setLoading(true);
    setErrorMsg("");

    const { data, error } = await listActividades({ includeInactive: true });

    if (error) {
      console.error(error);
      setErrorMsg(error.message || "Error cargando actividades");
    } else {
      setActividades(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadActividades();
  }, []);

  function resetForm() {
    setFormMode("create");
    setEditingId(null);
    setNombre("");
    setDescripcion("");
    setCurrency("USD");
    setHourlyRate("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!nombre.trim()) {
      setErrorMsg("El nombre de la actividad es obligatorio");
      return;
    }

    if (!hourlyRate || Number(hourlyRate) <= 0) {
      setErrorMsg("La tarifa por hora debe ser un número mayor que 0");
      return;
    }

    try {
      if (formMode === "create") {
        const tenantId = profile?.tenant_id || profile?.org_id;
        if (!tenantId) {
          setErrorMsg("No se encontró tenant_id/org_id en el perfil del usuario");
          return;
        }

        const payload = {
          tenant_id: tenantId,
          name: nombre.trim(),
          description: descripcion.trim() || null,
          active: true,
          currency_code: currency,
          hourly_rate: Number(hourlyRate),
        };

        const { error } = await createActividad(payload);
        if (error) throw error;
      } else if (formMode === "edit" && editingId) {
        const { error } = await updateActividad(editingId, {
          name: nombre.trim(),
          description: descripcion.trim() || null,
          currency_code: currency,
          hourly_rate: Number(hourlyRate),
        });
        if (error) throw error;
      }

      resetForm();
      await loadActividades();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Error guardando actividad");
    }
  }

  function handleEdit(act) {
    setFormMode("edit");
    setEditingId(act.id);

    setNombre(act.name || "");
    setDescripcion(act.description || "");
    setCurrency(act.currency_code || "USD");
    setHourlyRate(act.hourly_rate || "");
  }

  async function handleToggle(act) {
    try {
      const { error } = await toggleActividadActiva(act.id, !act.active);
      if (error) throw error;
      await loadActividades();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Error actualizando estado");
    }
  }

  async function handleDelete(act) {
    if (!window.confirm(`¿Eliminar la actividad "${act.name}"?`)) return;
    try {
      const { error } = await deleteActividad(act.id);
      if (error) throw error;
      await loadActividades();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Error eliminando actividad");
    }
  }

  // 🔒 Trackers no pueden crear ni editar actividades
  const canEdit = role === "owner" || role === "admin";

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Actividades</h1>

      {errorMsg && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Formulario */}
      {canEdit ? (
        <div className="mb-8 bg-white shadow-sm rounded-lg p-4 border border-gray-100">
          <h2 className="text-lg font-medium mb-3">
            {formMode === "create" ? "Nueva actividad" : "Editar actividad"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Inspección de campo"
              />
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción
              </label>
              <textarea
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                rows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Descripción breve (opcional)"
              />
            </div>

            {/* Moneda */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Moneda
              </label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tarifa por hora */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tarifa por hora
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="Ej. 5.00"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
              >
                {formMode === "create" ? "Crear actividad" : "Guardar cambios"}
              </button>

              {formMode === "edit" && (
                <button
                  type="button"
                  className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
                  onClick={resetForm}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>
      ) : (
        <div className="mb-6 text-sm text-gray-600">
          (Modo lectura — los trackers no pueden modificar actividades)
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-700">
            Listado de actividades
          </h2>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-500">Cargando actividades…</div>
        ) : actividades.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            No hay actividades registradas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    Nombre
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    Descripción
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    Costo/h
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    Estado
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">
                    Acciones
                  </th>
                </tr>
              </thead>

              <tbody>
                {actividades.map((act) => (
                  <tr key={act.id} className="border-t border-gray-100">
                    {/* Nombre */}
                    <td className="px-4 py-2 align-top">
                      <div className="font-medium text-gray-900">
                        {act.name}
                      </div>
                    </td>

                    {/* Descripción */}
                    <td className="px-4 py-2 align-top">
                      {act.description || "—"}
                    </td>

                    {/* Tarifa */}
                    <td className="px-4 py-2 align-top">
                      {act.hourly_rate
                        ? `${act.currency_code} ${act.hourly_rate.toFixed(2)}`
                        : "—"}
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-2 align-top">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          act.active
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-gray-50 text-gray-500 border border-gray-200"
                        }`}
                      >
                        {act.active ? "Activa" : "Inactiva"}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-2 align-top text-right space-x-2">
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                            onClick={() => handleEdit(act)}
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            className="inline-flex items-center rounded-md bg-slate-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-600"
                            onClick={() => handleToggle(act)}
                          >
                            {act.active ? "Desactivar" : "Activar"}
                          </button>

                          <button
                            type="button"
                            className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700"
                            onClick={() => handleDelete(act)}
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
