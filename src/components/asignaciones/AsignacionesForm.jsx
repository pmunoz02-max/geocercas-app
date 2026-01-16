// src/components/asignaciones/AsignacionesForm.jsx

/* eslint-disable react/prop-types */
import { useTranslation } from "react-i18next";

export default function AsignacionesForm({
  formMode,
  minFrecuencia,
  nowInputMin,
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
  const { t } = useTranslation();

  const title =
    formMode === "create"
      ? t("asignaciones.form.newTitle", { defaultValue: "New assignment" })
      : t("asignaciones.form.editTitle", { defaultValue: "Edit assignment" });

  const activityEmptyHint =
    actividadOptions.length === 0
      ? t("asignaciones.form.quickActivity.noActivitiesHint", {
          defaultValue:
            "No activities yet (create one in Activities module or here below).",
        })
      : t("asignaciones.form.activityPlaceholder", {
          defaultValue: "Select an activity",
        });

  return (
    <div className="mb-8 bg-white rounded-lg border border-gray-100 shadow-sm p-4">
      <h2 className="text-lg font-medium mb-3">{title}</h2>

      <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Personal */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("asignaciones.form.personLabel", { defaultValue: "Person" })}
          </label>
          <select
            className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={formPersonalId}
            onChange={(e) => setFormPersonalId(e.target.value)}
          >
            <option value="">
              {t("asignaciones.form.personPlaceholder", {
                defaultValue: "Select a person",
              })}
            </option>
            {personalOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.apellido ? p.apellido : ""}{" "}
                {p.email ? `(${p.email})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Geocerca */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("asignaciones.form.geofenceLabel", { defaultValue: "Geofence" })}
          </label>
          <select
            className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={formGeocercaId}
            onChange={(e) => setFormGeocercaId(e.target.value)}
          >
            <option value="">
              {t("asignaciones.form.geofencePlaceholder", {
                defaultValue: "Select a geofence",
              })}
            </option>
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
            {t("asignaciones.form.activityLabel", { defaultValue: "Activity" })}
          </label>
          <select
            className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={formActividadId}
            onChange={(e) => setFormActividadId(e.target.value)}
          >
            <option value="">{activityEmptyHint}</option>
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
                activityMessageType === "success"
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-red-50 border-red-200 text-red-700"
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
                <span>
                  {t("asignaciones.form.quickActivity.newButton", {
                    defaultValue: "New activity",
                  })}
                </span>
              </button>
            )}

            {creatingActivity && (
              <div className="flex flex-col md:flex-row gap-2 items-start">
                <input
                  type="text"
                  placeholder={t(
                    "asignaciones.form.quickActivity.newNamePlaceholder",
                    { defaultValue: "New activity name" }
                  )}
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
                    {savingActivity
                      ? t("asignaciones.form.quickActivity.saving", {
                          defaultValue: "Saving…",
                        })
                      : t("asignaciones.form.quickActivity.saveButton", {
                          defaultValue: "Save activity",
                        })}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingActivity(false);
                      setNewActivityName("");
                    }}
                    className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    {t("common.actions.cancel", { defaultValue: "Cancel" })}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Frecuencia */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("asignaciones.form.frequencyLabel", {
              defaultValue: "Frequency (min)",
            })}
          </label>
          <input
            type="number"
            min={minFrecuencia}
            className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={formFrecuenciaMin}
            onChange={(e) => setFormFrecuenciaMin(e.target.value)}
          />
        </div>

        {/* Fecha/hora inicio */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("asignaciones.form.startLabel", {
              defaultValue: "Start date/time",
            })}
          </label>
          <input
            type="datetime-local"
            className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={formInicio}
            min={formMode === "create" ? nowInputMin || undefined : undefined}
            onChange={(e) => setFormInicio(e.target.value)}
          />
        </div>

        {/* Fecha/hora fin */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("asignaciones.form.endLabel", {
              defaultValue: "End date/time",
            })}
          </label>
          <input
            type="datetime-local"
            className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={formFin}
            min={
              formMode === "create"
                ? formInicio || nowInputMin || undefined
                : formInicio || undefined
            }
            onChange={(e) => setFormFin(e.target.value)}
          />
          <div className="mt-1 text-xs text-gray-500">
            {t("asignaciones.form.endOptionalHint", {
              defaultValue: "Optional",
            })}
          </div>
        </div>

        {/* Botones */}
        <div className="md:col-span-2 flex items-center gap-2 mt-2">
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {formMode === "create"
              ? t("asignaciones.form.saveButton", {
                  defaultValue: "Save assignment",
                })
              : t("asignaciones.form.updateButton", {
                  defaultValue: "Update assignment",
                })}
          </button>

          {formMode === "edit" && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              {t("asignaciones.form.cancelEditButton", {
                defaultValue: "Cancel editing",
              })}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
