// src/components/asignaciones/AsignacionesForm.jsx

/* eslint-disable react/prop-types */
export default function AsignacionesForm({
  formMode,
  minFrecuencia,
  nowInputMin, // ya no se usa para min nativo, pero lo dejamos por si luego lo necesitas
  personalOptions,
  geocercaOptions,
  actividadOptions,
  formPersonalId,
  formGeocercaId,
  formActividadId,
  formInicio,
  formFin,
  formFrecuenciaMin,
  setFormPersonalId,
  setFormGeocercaId,
  setFormActividadId,
  setFormInicio,
  setFormFin,
  setFormFrecuenciaMin,
  // creación rápida de actividades
  creatingActivity,
  setCreatingActivity,
  newActivityName,
  setNewActivityName,
  savingActivity,
  activityMessage,
  activityMessageType,
  onSubmit,
  onCancel,
  onCreateActivity,
}) {
  return (
    <div className="mb-8 bg-white rounded-lg border border-gray-100 shadow-sm p-4">
      <h2 className="text-lg font-medium mb-3">
        {formMode === 'create' ? 'Nueva asignación' : 'Editar asignación'}
      </h2>

      {/* noValidate para que el navegador no se meta en la validación */}
      <form
        onSubmit={onSubmit}
        noValidate
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {/* Personal */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Personal
          </label>
          <select
            className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={formPersonalId}
            onChange={(e) => setFormPersonalId(e.target.value)}
          >
            <option value="">Seleccione…</option>
            {personalOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.apellido ? p.apellido : ''}{' '}
                {p.email ? `(${p.email})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Geocerca */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Geocerca
          </label>
          <select
            className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={formGeocercaId}
            onChange={(e) => setFormGeocercaId(e.target.value)}
          >
            <option value="">Seleccione…</option>
            {geocercaOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name || g.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Actividad */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Actividad
          </label>
          <select
            className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={formActividadId}
            onChange={(e) => setFormActividadId(e.target.value)}
          >
            <option value="">
              {actividadOptions.length === 0
                ? 'No hay actividades (cree una en el módulo Actividades o aquí abajo)'
                : '(Opcional) Seleccione…'}
            </option>
            {actividadOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Mensaje de resultado al guardar actividad */}
          {activityMessage && (
            <div
              className={`mt-2 inline-flex items-center rounded-md border px-3 py-1 text-xs ${
                activityMessageType === 'success'
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {activityMessage}
            </div>
          )}

          {/* Controles para crear nueva actividad desde la misma UI */}
          <div className="mt-3 flex flex-col gap-2">
            {!creatingActivity && (
              <button
                type="button"
                onClick={() => setCreatingActivity(true)}
                className="inline-flex items-center gap-2 self-start rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                <span className="text-base leading-none">＋</span>
                <span>Nueva actividad</span>
              </button>
            )}

            {creatingActivity && (
              <div className="flex flex-col md:flex-row gap-2 items-start">
                <input
                  type="text"
                  placeholder="Nombre de la nueva actividad"
                  className="w-full md:flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newActivityName}
                  onChange={(e) => setNewActivityName(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={savingActivity}
                    onClick={onCreateActivity}
                    className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {savingActivity ? 'Guardando…' : 'Guardar actividad'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingActivity(false);
                      setNewActivityName('');
                    }}
                    className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Frecuencia */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Frecuencia (minutos)
          </label>
          <input
            type="number"
            min={minFrecuencia}
            className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={formFrecuenciaMin}
            onChange={(e) => setFormFrecuenciaMin(e.target.value)}
          />
        </div>

        {/* Fecha/hora inicio (TEXT, no datetime-local) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fecha inicio
          </label>
          <input
            type="text"
            placeholder="DD/MM/AAAA HH:MM o 2025-11-13T09:11"
            className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={formInicio}
            onChange={(e) => setFormInicio(e.target.value)}
          />
        </div>

        {/* Fecha/hora fin (TEXT, opcional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fecha fin (opcional)
          </label>
          <input
            type="text"
            placeholder="DD/MM/AAAA HH:MM o 2025-11-14T19:17"
            className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={formFin}
            onChange={(e) => setFormFin(e.target.value)}
          />
        </div>

        {/* Botones */}
        <div className="md:col-span-2 flex items-center gap-2 mt-2">
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {formMode === 'create' ? 'Crear asignación' : 'Guardar cambios'}
          </button>
          {formMode === 'edit' && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
