import { useEffect, useMemo, useState } from "react";
import {
  createAsignacion,
  getAsignacionesBundle,
  updateAsignacion,
return (
  <div className="p-4 max-w-6xl mx-auto">
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-6">
      <h2 className="text-2xl font-semibold text-gray-900 mb-4">
        Nueva asignación
      </h2>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Persona
          </label>
          <select
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
            value={selectedPersonId}
            onChange={(e) => setSelectedPersonId(e.target.value)}
          >
            <option value="">Seleccionar</option>
            {personasDisponibles.map((p) => {
              const id = p?.id ?? p?.personal_id ?? null;
              if (!id) return null;
              return (
                <option key={id} value={id}>
                  {personLabel(p)}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Geocerca
          </label>
          <select
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
            value={selectedGeocercaId}
            onChange={(e) => setSelectedGeocercaId(e.target.value)}
          >
            <option value="">Seleccionar</option>
            {geofenceOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Actividad
          </label>
          <select
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
            value={selectedActivityId}
            onChange={(e) => setSelectedActivityId(e.target.value)}
          >
            <option value="">Seleccionar</option>
            {actividades.map((a) => (
              <option key={a.id} value={a.id}>
                {actividadLabel(a)}
              </option>
            ))}
          </select>
          {actividades.length === 0 ? (
            <p className="mt-2 text-sm text-amber-700">
              No hay actividades disponibles para esta organización.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Fecha/hora inicio
            </label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              value={startTime}
              onChange={(e) => {
                const nextStart = e.target.value;
                setStartTime(nextStart);

                if (endTime && nextStart && new Date(endTime) < new Date(nextStart)) {
                  setEndTimeError("La fecha/hora de fin no puede ser anterior a la de inicio.");
                } else {
                  setEndTimeError("");
                }
              }}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Fecha/hora fin
            </label>
            <input
              type="datetime-local"
              min={startTime || undefined}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              value={endTime}
              onChange={(e) => {
                const nextEnd = e.target.value;
                setEndTime(nextEnd);

                if (startTime && nextEnd && new Date(nextEnd) < new Date(startTime)) {
                  setEndTimeError("La fecha/hora de fin no puede ser anterior a la de inicio.");
                } else {
                  setEndTimeError("");
                }
              }}
            />
            {endTimeError ? (
              <p className="mt-1 text-sm text-red-600">{endTimeError}</p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Estado
            </label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="active">Activa</option>
              <option value="inactive">Inactiva</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Frecuencia (minutos)
            </label>
            <input
              type="number"
              min="1"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              value={freqMin}
              onChange={(e) => setFreqMin(e.target.value)}
            />
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar asignación"}
          </button>
        </div>
      </form>
    </div>

    <AsignacionesTable
      asignaciones={asignaciones}
      people={personas}
      geofences={geocercas}
      activities={actividades}
      onEdit={handleEdit}
      onToggleStatus={handleToggleStatus}
      onDelete={handleDelete}
    />
  </div>
);
    setSuccess("");
    setEndTimeError("");

    if (!activeOrgId) {
      setError("No hay organización activa.");
      return;
    }

    if (!resolvedSelectedPersonId) {
      setError("Debe seleccionar una persona válida.");
      return;
    }

    if (!selectedGeocercaId) {
      setError("Debe seleccionar una geocerca.");
      return;
    }

    if (!selectedActivityId) {
      setError("Debe seleccionar una actividad.");
      return;
    }

    if (!startTime) {
      setError("Debe seleccionar la fecha/hora de inicio.");
      return;
    }

    // Validar que endTime no sea menor que startTime
    if (endTime && startTime && new Date(endTime) < new Date(startTime)) {
      setEndTimeError("La fecha/hora de fin no puede ser anterior a la de inicio.");
      setError("La fecha/hora de fin no puede ser anterior a la de inicio.");
      return;
    }

    const parsedFreqMin = Number(freqMin);
    if (!Number.isFinite(parsedFreqMin) || parsedFreqMin <= 0) {
      setError("La frecuencia debe ser mayor que 0.");
      return;
    }

    setSaving(true);

    const payload = {
      personal_id: resolvedSelectedPersonId,
      org_id: activeOrgId,
      tenant_id: activeOrgId,
      geofence_id: selectedGeocercaId || null,
      geocerca_id: null,
      activity_id: selectedActivityId || null,
      start_time: startTime ? new Date(startTime).toISOString() : null,
      end_time: endTime ? new Date(endTime).toISOString() : null,
      frecuencia_envio_sec: parsedFreqMin * 60,
      status,
      ...(selectedTrackerUserId ? { tracker_user_id: selectedTrackerUserId } : {}),
    };

    try {
      await createAsignacion(payload, activeOrgId);
      await loadAll();

      setSelectedPersonId("");
      setSelectedGeocercaId("");
      setSelectedActivityId("");
      setStartTime("");
      setEndTime("");
      setStatus("active");
      setFreqMin(5);

      setSuccess(
        selectedTrackerUserId
          ? "Asignación guardada correctamente."
          : "Asignación guardada correctamente."
      );
    } catch (e2) {
      console.error(e2);
      setError(e2?.message || "Error al guardar asignación.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(row) {
    try {
      setError("");
      setSuccess("");

      const id = row?.id;
      if (!id) return;

      const patch = { ...row };
      delete patch.id;

      await updateAsignacion(id, patch, activeOrgId);
      await loadAll();
      setSuccess("Asignación actualizada correctamente.");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Error al editar asignación.");
    }
  }

  async function handleToggleStatus(row) {
    try {
      setError("");
      setSuccess("");

      const id = row?.id;
      if (!id) return;

      const current =
        String(row?.status || row?.estado || "").toLowerCase() === "active" ||
        String(row?.status || row?.estado || "").toLowerCase() === "activa"
          ? "active"
          : "inactive";

      const next = current === "active" ? "inactive" : "active";

      await toggleAsignacionStatus(id, next, activeOrgId);
      await loadAll();
      setSuccess(
        next === "active"
          ? "Asignación activada correctamente."
          : "Asignación desactivada correctamente."
      );
    } catch (e) {
      console.error(e);
      setError(e?.message || "Error al cambiar estado de asignación.");
    }
  }

  async function handleDelete(id) {
    try {
      setError("");
      setSuccess("");

      if (!id) return;

      await deleteAsignacion(id, activeOrgId);
      await loadAll();
      setSuccess("Asignación eliminada correctamente.");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Error al eliminar asignación.");
    }
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
          Nueva asignación
        </h2>

        return (
          <div className="p-4 max-w-6xl mx-auto">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                Nueva asignación
              </h2>
            </div>
            {/* Alerts outside the form */}
            {error ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            {success ? (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {success}
              </div>
            ) : null}
            <form className="space-y-4" onSubmit={handleSubmit}>
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Fecha/hora fin
              </label>
              <input
                type="datetime-local"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  // Validar endTime en cada cambio
                  if (startTime && e.target.value && new Date(e.target.value) < new Date(startTime)) {
                    setEndTimeError("La fecha/hora de fin no puede ser anterior a la de inicio.");
                  } else {
                    setEndTimeError("");
                  }
                }}
              />
              {endTimeError && (
                <p className="mt-1 text-sm text-red-600">{endTimeError}</p>
              )}
            </div>
                if (!id) return null;
                return (
                  <option key={id} value={id}>
                    {personLabel(p)}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Geocerca
            </label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              value={selectedGeocercaId}
              onChange={(e) => setSelectedGeocercaId(e.target.value)}
            >
              <option value="">Seleccionar</option>
              {geofenceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Actividad
            </label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
            >
              <option value="">Seleccionar</option>
              {actividades.map((a) => (
                <option key={a.id} value={a.id}>
                  {actividadLabel(a)}
                </option>
              ))}
            </select>
            {actividades.length === 0 ? (
              <p className="mt-2 text-sm text-amber-700">
                No hay actividades disponibles para esta organización.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Fecha/hora inicio
              </label>
              <input
                type="datetime-local"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Fecha/hora fin
              </label>
              <input
                type="datetime-local"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Estado
              </label>
              <select
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="active">Activa</option>
                <option value="inactive">Inactiva</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Frecuencia (minutos)
              </label>
              <input
                type="number"
                min="1"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                value={freqMin}
                onChange={(e) => setFreqMin(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar asignación"}
            </button>
          </div>
        </form>
      </div>

      <AsignacionesTable
        asignaciones={asignaciones}
        people={personas}
        geofences={geocercas}
        activities={actividades}
        onEdit={handleEdit}
        onToggleStatus={handleToggleStatus}
        onDelete={handleDelete}
      />
    </div>
  );
}