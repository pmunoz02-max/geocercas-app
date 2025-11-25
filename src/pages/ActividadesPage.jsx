// src/pages/ActividadesPage.jsx
import { useEffect, useState } from 'react';
import {
  listActividades,
  createActividad,
  updateActividad,
  toggleActividadActiva,
  deleteActividad,
} from '../lib/actividadesApi';
// ✅ SIEMPRE así (ajusta el número de ../ según el nivel):
import { useAuth } from "../context/AuthContext.jsx";

export default function ActividadesPage() {
  const { profile } = useAuth(); // aquí viene tenant_id / org_id
  const [actividades, setActividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [formMode, setFormMode] = useState('create'); // 'create' | 'edit'
  const [editingId, setEditingId] = useState(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');

  async function loadActividades() {
    setLoading(true);
    setErrorMsg('');

    const { data, error } = await listActividades({ includeInactive: true });

    if (error) {
      console.error(error);
      setErrorMsg(error.message || 'Error cargando actividades');
    } else {
      setActividades(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadActividades();
  }, []);

  function resetForm() {
    setFormMode('create');
    setEditingId(null);
    setNombre('');
    setDescripcion('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');

    if (!nombre.trim()) {
      setErrorMsg('El nombre de la actividad es obligatorio');
      return;
    }

    try {
      if (formMode === 'create') {
        const tenantId = profile?.tenant_id || profile?.org_id;
        if (!tenantId) {
          setErrorMsg('No se encontró tenant_id/org_id en el perfil del usuario');
          return;
        }

        const payload = {
          tenant_id: tenantId,
          name: nombre.trim(),
          description: descripcion.trim() || null,
          active: true,
        };

        const { error } = await createActividad(payload);
        if (error) throw error;
      } else if (formMode === 'edit' && editingId) {
        const { error } = await updateActividad(editingId, {
          name: nombre.trim(),
          description: descripcion.trim() || null,
        });
        if (error) throw error;
      }

      resetForm();
      await loadActividades();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Error guardando actividad');
    }
  }

  function handleEdit(act) {
    setFormMode('edit');
    setEditingId(act.id);
    setNombre(act.name || '');
    setDescripcion(act.description || '');
  }

  async function handleToggle(act) {
    try {
      const { error } = await toggleActividadActiva(act.id, !act.active);
      if (error) throw error;
      await loadActividades();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Error actualizando estado');
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
      setErrorMsg(err.message || 'Error eliminando actividad');
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Actividades</h1>

      {errorMsg && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Formulario */}
      <div className="mb-8 bg-white shadow-sm rounded-lg p-4 border border-gray-100">
        <h2 className="text-lg font-medium mb-3">
          {formMode === 'create' ? 'Nueva actividad' : 'Editar actividad'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Inspección de campo"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción breve (opcional)"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {formMode === 'create' ? 'Crear actividad' : 'Guardar cambios'}
            </button>
            {formMode === 'edit' && (
              <button
                type="button"
                className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                onClick={resetForm}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Tabla */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
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
                    <td className="px-4 py-2 align-top">
                      <div className="font-medium text-gray-900">
                        {act.name}
                      </div>
                    </td>
                    <td className="px-4 py-2 align-top">
                      <div className="text-gray-700 whitespace-pre-wrap">
                        {act.description || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-2 align-top">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          act.active
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-gray-50 text-gray-500 border border-gray-200'
                        }`}
                      >
                        {act.active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-4 py-2 align-top text-right space-x-2">
                      <button
                        type="button"
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                        onClick={() => handleEdit(act)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-gray-600 hover:text-gray-800"
                        onClick={() => handleToggle(act)}
                      >
                        {act.active ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-red-600 hover:text-red-800"
                        onClick={() => handleDelete(act)}
                      >
                        Eliminar
                      </button>
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
