// src/pages/Actividades.jsx
// Gestión de catálogo de actividades para el administrador

import React, { useEffect, useMemo, useState } from "react";
import {
  listActivities,
  createActivity,
  updateActivity,
  toggleActivity,
  deleteActivity,
} from "../lib/activitiesApi";
import { useAuth } from "../context/AuthContext";

const initialForm = {
  id: null,
  name: "",
  active: true,
};

export default function ActividadesPage() {
  const { user } = useAuth() || {};
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingForm, setLoadingForm] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [q, setQ] = useState("");

  const [form, setForm] = useState(initialForm);
  const [mode, setMode] = useState("view"); // view | create | edit
  const [selectedId, setSelectedId] = useState(null);

  const [qDebounced, setQDebounced] = useState("");

  useEffect(() => {
    const h = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(h);
  }, [q]);

  useEffect(() => {
    fetchActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive, qDebounced]);

  async function fetchActivities() {
    try {
      setLoading(true);
      setErrorMsg("");
      const data = await listActivities({ includeInactive: showInactive });
      setRows(data || []);
    } catch (err) {
      console.error("Error al cargar actividades:", err);
      setErrorMsg(err.message || "No se pudieron cargar las actividades");
    } finally {
      setLoading(false);
    }
  }

  const filteredRows = useMemo(() => {
    if (!qDebounced) return rows;
    const qq = qDebounced.toLowerCase();
    return rows.filter((r) => (r.name || "").toLowerCase().includes(qq));
  }, [rows, qDebounced]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedId) || null,
    [rows, selectedId]
  );

  function resetForm() {
    setForm(initialForm);
    setMode("view");
    setSelectedId(null);
    setErrorMsg("");
    setSuccessMsg("");
  }

  function handleNueva() {
    setForm(initialForm);
    setMode("create");
    setSelectedId(null);
    setErrorMsg("");
    setSuccessMsg("");
  }

  function handleSelectRow(row) {
    setSelectedId(row.id);
    setMode("edit");
    setForm({
      id: row.id,
      name: row.name || "",
      active: !!row.active,
    });
    setSuccessMsg("");
    setErrorMsg("");
  }

  function handleChangeForm(e) {
    const { name, type, checked, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmitForm(e) {
    e.preventDefault();
    setLoadingForm(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      if (!form.name.trim()) {
        setErrorMsg("El nombre de la actividad es obligatorio");
        return;
      }

      if (mode === "create") {
        await createActivity({ name: form.name, active: form.active });
        setSuccessMsg("Actividad creada correctamente");
      } else if (mode === "edit" && form.id) {
        await updateActivity(form.id, {
          name: form.name,
          active: form.active,
        });
        setSuccessMsg("Actividad actualizada correctamente");
      } else {
        setErrorMsg("Modo de formulario inválido");
        return;
      }

      await fetchActivities();
      if (mode === "create") {
        resetForm();
      }
    } catch (err) {
      console.error("Error al guardar actividad:", err);
      setErrorMsg(err.message || "No se pudo guardar la actividad");
    } finally {
      setLoadingForm(false);
    }
  }

  async function handleToggleActive(row) {
    try {
      await toggleActivity(row.id);
      await fetchActivities();
    } catch (err) {
      console.error("Error al cambiar estado de actividad:", err);
      setErrorMsg(err.message || "No se pudo cambiar el estado de la actividad");
    }
  }

  async function handleDelete(row) {
    const ok = window.confirm(
      `¿Seguro que deseas desactivar la actividad "${row.name}"?`
    );
    if (!ok) return;

    try {
      await deleteActivity(row.id);
      setSuccessMsg("Actividad desactivada (soft-delete).");
      await fetchActivities();
      if (selectedId === row.id) {
        resetForm();
      }
    } catch (err) {
      console.error("Error al desactivar actividad:", err);
      setErrorMsg(err.message || "No se pudo desactivar la actividad");
    }
  }

  return (
    <div className="p-4 space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Actividades</h1>
          <p className="text-sm text-gray-600">
            Catálogo de actividades que podrás asignar a tu personal.
          </p>
          {user && (
            <p className="text-xs text-gray-500 mt-1">
              Sesión: <span className="font-mono">{user.email}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleNueva}
            className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            + Nueva actividad
          </button>
          <button
            type="button"
            onClick={fetchActivities}
            className="px-3 py-1 rounded border text-sm hover:bg-gray-100"
          >
            Refrescar
          </button>
        </div>
      </header>

      {(errorMsg || successMsg) && (
        <div className="space-y-2">
          {errorMsg && (
            <div className="px-3 py-2 rounded bg-red-100 text-red-800 text-sm">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="px-3 py-2 rounded bg-green-100 text-green-800 text-sm">
              {successMsg}
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <section className="border rounded p-3 bg-gray-50 space-y-3">
        <div className="grid gap-3 md:grid-cols-[2fr,auto,auto] items-end">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-700">
              Buscar
            </label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre de actividad..."
              className="border rounded px-2 py-1 text-sm"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Mostrar también inactivas
          </label>

          {loading && (
            <span className="text-xs text-gray-500">Cargando...</span>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        {/* Tabla */}
        <section className="border rounded p-2">
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="font-medium text-sm">Listado de actividades</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 text-left">Nombre</th>
                  <th className="border px-2 py-1 text-left">Estado</th>
                  <th className="border px-2 py-1 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="border px-2 py-3 text-center text-gray-500"
                    >
                      No hay actividades para los filtros actuales.
                    </td>
                  </tr>
                )}

                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className={
                      "cursor-pointer hover:bg-blue-50" +
                      (selectedId === row.id ? " bg-blue-100" : "")
                    }
                    onClick={() => handleSelectRow(row)}
                  >
                    <td className="border px-2 py-1">{row.name}</td>
                    <td className="border px-2 py-1">
                      {row.active ? "Activa" : "Inactiva"}
                    </td>
                    <td
                      className="border px-2 py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex gap-1 justify-center">
                        <button
                          type="button"
                          className="px-2 py-0.5 text-xs rounded border hover:bg-gray-100"
                          onClick={() => handleSelectRow(row)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="px-2 py-0.5 text-xs rounded border hover:bg-gray-100"
                          onClick={() => handleToggleActive(row)}
                        >
                          {row.active ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          type="button"
                          className="px-2 py-0.5 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                          onClick={() => handleDelete(row)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Formulario */}
        <section className="border rounded p-3 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm">
              {mode === "create"
                ? "Nueva actividad"
                : mode === "edit"
                ? "Editar actividad"
                : "Detalles / nueva actividad"}
            </h2>
            <button
              type="button"
              className="text-xs text-gray-600 hover:underline"
              onClick={resetForm}
            >
              Limpiar
            </button>
          </div>

          <form className="space-y-3" onSubmit={handleSubmitForm}>
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-700">
                Nombre
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChangeForm}
                className="border rounded px-2 py-1 text-sm"
                required
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="actividad-activa"
                type="checkbox"
                name="active"
                checked={form.active}
                onChange={handleChangeForm}
                className="rounded border-gray-300"
              />
              <label
                htmlFor="actividad-activa"
                className="text-xs font-medium text-gray-700"
              >
                Actividad activa
              </label>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              {mode === "edit" && (
                <button
                  type="button"
                  className="px-3 py-1 rounded border text-sm hover:bg-gray-100"
                  onClick={handleNueva}
                >
                  Nueva
                </button>
              )}
              <button
                type="submit"
                disabled={loadingForm}
                className="px-3 py-1 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
              >
                {loadingForm
                  ? "Guardando..."
                  : mode === "edit"
                  ? "Guardar cambios"
                  : "Crear actividad"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
